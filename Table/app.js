//Timer for each search
var start = process.hrtime();

var elapsed_time = function(note){
    var precision = 3; // 3 decimal places
    var elapsed = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli
    console.log(note + ' - ' + process.hrtime(start)[0] + " s, " + elapsed.toFixed(precision) + " ms"); // print message + time
    start = process.hrtime(); // reset the timer
}

//set up express and socket
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);

//run the server at port 8081
port = 8081;
server.listen(port, function() {
	console.log('Table server running at port: ' + port);
});

//connect HTML file to server
app.get('/', function(require, resolve){
 	resolve.sendFile(__dirname + '/index.html')
});

//connect css 'static' files to server
app.use(express.static(__dirname + '/public'));

//call Wit API with the SERVER_ACCESS_TOKEN
const Wit = require('node-wit').Wit;
const wit = new Wit({accessToken: 'GVBQOTI2MKXYIM265DOVIKII44BSWIFF'});

//set up json-query
var jsonQuery = require('json-query');

/* THE USERNAME VARIABLE NEEDS TO BE REPLACED WITH THE USERNAME OF THE LOGGED IN PERSON */
//create a namespace for the table
var username = "username";
var nsp = io.of('/' + username);
nsp.on('connection', function(socket){
 	//default: show all patients
	readContent(function (err, data) {
		formatResponse(jsonQuery('study.patients[*]', { data: data }).value, function(message) {
			nsp.emit('bot message', {msg: message});
		});
	});

 	//Send message
 	socket.on('send message', function(data){
	    nsp.emit('new message', {msg: data});
	    handleMessage(data);
  	});
});

//parse JSON files for data in an async function
var fs = require('fs');
function readContent(callback) {
 	fs.readFile('db/study.json', 'utf8', function (err, data) {
    	if (err) throw err;
    	var obj = JSON.parse(data);
    	callback(null, obj);
  	});
}
function readTMBContent(callback) {
	fs.readFile('db/Patient_TMB.json', 'utf8', function (err, data) {
		if (err) throw err;
    	var obj = JSON.parse(data);
    	callback(null, obj);
	});
}

//send bot messages by emitting 'bot message'
function send(message) {
	if (message == '') {
	    nsp.emit('bot message', {msg: 'Sorry, no found result.'});
  	} else {
	    nsp.emit('bot message', {msg: message});
  	}
}

//Insert space in between words to prep entity names to query
function insertSpaces(s, callback) {
    s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
    s = s.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
    return s;
}

//print the filters
function printFilters(filter, key) {
  	//remove 'intent' entity
  	key.splice(key.indexOf('intent'), key.indexOf('intent')+1);

  	//go through filters and print them
  	for (var i = 0; i < key.length; i++) {
  		var filterMsg = insertSpaces(key[i]) + ': ' + filter[key[i]][0].value;
		nsp.emit('filter-criteria', {msg: filterMsg});
  	}
}

//create the query statement for the json-query module
function createQuery(entities, keys) {
	var query = '';
  	//remove 'intent' entity
  	keys.splice(keys.indexOf('intent'), keys.indexOf('intent')+1);
  	if (keys.length == 0) {
	    return query;
  	} else {
	    for (var i = 0; i < keys.length; i++) {
	    	//if the roles of age (start and end) are detected the query should >= or <=
	    	if (keys[i] == 'start') {
	        	query += 'age' + '>=' + entities[keys[i]][0].value + ' & ';
	    	} else if (keys[i] == 'end') {
				query += 'age' + '<=' + entities[keys[i]][0].value + ' & ';
	    	} else {
	    		//insertSpaces() gives spaces to the entity keys to properly query the JSON files
	        	query += insertSpaces(keys[i]) + '=' + entities[keys[i]][0].value + ' & ';
	    	}
    	}
    }
    //return query statement without the last ' & '
    return query.substring(0, query.length-3);
}

//create the query statement for TMB queries
function createTMBQuery(queryResult, TMBQuery) {
	//array to get results that match both arrays	
	var results = [];
	var count = 0;
	for (var i = 0; i < queryResult.length; i++) {
		for (var j = 0; j < TMBQuery.length; j++) {
			if (queryResult[i] == TMBQuery[j]) {
				results[count] = queryResult[i];
				count++;
			}
		}
	}

	//put together the query statement
	var query = '';
	if (results.length > 0) {
	    for (var i = 0; i < results.length; i++) {
	        query += 'id=' + results[i] + ' | ';
		}
		return query.substring(0, query.length-3);
	} else {
		return 'null';
	}
}

//formats the result of the query in a table fashion
function formatResponse(result, callback) {
	if (result.length > 0) {
		readTMBContent(function (err, data) {
			var message = '<table id="table_msg">';
			//var keys = ['Study', 'Group', 'Visit', 'Originating ID', 'BioInventory Registration', 'USUBJID', 'Sample Status', 'QC Reported Gender',	'Source Matcode', 'Container Matcode', 'Concentration', 'Volume'];
			var keys = Object.keys(result[0]);

			//go through the keys array to get all the table headings
			message += '<tr><thead>';
			for (var i = 0; i < keys.length; i++) {
				var key = keys[i].toUpperCase();
				message += '<th>' + key + '</th>';
			}
			if (keys.indexOf('gender') > -1) {
				message += '<th>TMB</th>';
			}
			message += '</tr></thead><tbody id="myTableBody">';
			
			//each following row contains the info of each patient in the results
			for (var i = 0; i < result.length; i++) {
				message += '<tr>';
				for (var j = 0; j < keys.length; j++) {
					if (Array.isArray(result[i][keys[j]])) {
						var value = result[i][keys[j]].length;
					} else {
						var value = result[i][keys[j]];
					}
					message += '<td>' + value + '</td>';
				}
				if (keys.indexOf('gender') > -1) {
					var queryResult = jsonQuery('[*patients = ' + result[i]['id'] + '][TMB]', { data: data }).value;
					message += '<td>' + queryResult + '</td>';
					message += '</tr>';
				}
			}
			
			message += '</tbody></table>';
			callback(message);
		});
	} else {
		callback('');
	}
}

function handleMessage(question) {
 	return wit.message(question).then(({entities}) => {
	    //check if intent exists
	    if (Array.isArray(entities['intent'])) {
      		//get the keys of the entities data
      		var keys = [];
      		for (var i = 0; i < Object.keys(entities).length; i++) {
		        keys[i] = Object.keys(entities)[i];
      		}

      		switch (entities['intent'][0].value) {
		        case 'show_patients':
          		readContent(function (err, data) {
		            var queryResult = jsonQuery('study.patients[*' + createQuery(entities, keys) + ']', { data: data }).value;
					formatResponse(queryResult, function(message) {
						send(message);
					});
          		});
          		break;
        		case 'show_studies':
          		readContent(function (err, data) {
		            var queryResult = jsonQuery('study[*' + createQuery(entities, keys) + ']', { data: data }).value;
            		formatResponse(queryResult, function(message) { 
						send(message);
					});
          		});
          		case 'show_patients_tmb':
	          	if (Array.isArray(entities['TMB'])) {
					readContent(function (err, data) {
					  	//remove 'TMB'
					  	keys.splice(keys.indexOf('TMB'), keys.indexOf('TMB')+1);
			            var queryResult = jsonQuery('study.patients[*'+ createQuery(entities, keys) + '][id]', { data: data }).value;
						
						readTMBContent(function(err, TMBData) {
							var TMBQuery = jsonQuery('[*TMB '+ entities['TMB'][0].value + '][patients]', { data: TMBData }).value;

							var finalQuery = jsonQuery('study.patients[*' + createTMBQuery(queryResult, TMBQuery) + ']', { data: data }).value; 
				            formatResponse(finalQuery, function(message) {
				            	send(message);
				            });
				        });
	          		});
	          	}
          		break;
	      	}
	      	//print the filters
	      	printFilters(entities, keys);
    	} else {
	    	send('Sorry, I couldn\'t understand that.');
    	}

    	elapsed_time('Table: ' + question.trim());
	});
}