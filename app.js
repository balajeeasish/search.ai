//App 1 - Chat App
//set up express and socket
var express = require('express');
var chat_app = express();
var chat_server = require('http').createServer(chat_app);
var chat_io = require('socket.io').listen(chat_server);

//run the server at port 8080
chat_port = 8080;
chat_server.listen(chat_port, function() {
	console.log('Chat server running at port: ' + chat_port);
});

//connect HTML file to server
chat_app.get('/', function(require, resolve){
 	resolve.sendFile(__dirname + '/index.html')
});

//connect css 'static' files to server
chat_app.use(express.static(__dirname + '/public'));

//App 2 - Results Table App
//set up express and socket
var results_table_app = express();
var results_table_server = require('http').createServer(results_table_app);
var results_table_io = require('socket.io').listen(results_table_server);

//run the server at port 8081
results_table_port = 8081;
results_table_server.listen(results_table_port, function() {
	console.log('Results Table server running at port: ' + results_table_port);
});

//connect HTML file to server
results_table_app.get('/', function(require, resolve){
 	resolve.sendFile(__dirname + '/results_table.html')
});

//connect css 'static' files to server
results_table_app.use(express.static(__dirname + '/public'));

//call Wit API with the SERVER_ACCESS_TOKEN
const Wit = require('node-wit').Wit;
const wit = new Wit({accessToken: 'GVBQOTI2MKXYIM265DOVIKII44BSWIFF'});

//set up json-query
var jsonQuery = require('json-query');

/* THE USERNAME VARIABLE NEEDS TO BE REPLACED WITH THE USERNAME OF THE LOGGED IN PERSON */
//create a namespace for the chat
var username = "username";
var nsp = chat_io.of('/' + username);
nsp.on('connection', function(socket){
 	//Send message
 	socket.on('send message', function(data){
	    nsp.emit('new message', {msg: data});
	    handleMessage(data);
  	});
});

//app 2 namespace
var nsp2 = results_table_io.of('/' + username);
nsp2.on('connection', function(socket){
	//default: show all patients
	readContent(function (err, data) {
		formatResponseTable(jsonQuery('study.patients[*]', { data: data }).value, function(message) {
			nsp2.emit('bot message', {msg: message});
		});
	});

 	//Send message
 	socket.on('send message', function(data){
	    handleResultsTableMessage(data);
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

function tableSend(message) {
	if (message == '') {
	    nsp2.emit('bot message', {msg: 'Sorry, no found result.'});
  	} else {
	    nsp2.emit('bot message', {msg: message});
  	}
}

//Insert space in between words to prep entity names to query
function insertSpaces(s, callback) {
    s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
    s = s.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
    return s;
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
	        	
	        	//emit filters in query
	        	var filterMsg = insertSpaces(keys[i]) + ' = ' + entities[keys[i]][0].value;
	        	nsp2.emit('filter-criteria', {msg: filterMsg});
	    	}
    	}
    }
    //return query statement without the last ' & '
    return query.substring(0, query.length-3);
}

//formats the result of the query in a readable fashion
function formatResponse(result, callback) {
	if (result.length > 0) {
		readTMBContent(function (err, data) {	
			var message = '';
			//var keys = ['Study', 'Visit', 'Originating ID', 'QC Reported Gender', 'Source Matcode', 'Container Matcode'];
			var keys = Object.keys(result[0]);
			for (var i = 0; i < result.length; i++) {
				for (var j = 0; j < keys.length; j++) {
					var key = keys[j];
					//Capitalize the first letter of the keys
					var formattedKey = key.charAt(0).toUpperCase() + key.slice(1);
					//if a property is an array, print length of array instead of the array
					if (Array.isArray(result[i][keys[j]])) {
						var value = result[i][keys[j]].length;
					} else {
						var value = result[i][keys[j]];
					}
					message += formattedKey + ': ' + value + '<br>';
				}
				var queryResult = jsonQuery('[*patients = ' + result[i]['id'] + '][TMB]', { data: data }).value;
				message += 'TMB: ' + queryResult + '<br><br>';
			}
			//return formatted message without the last '<br>'
			callback(message.substring(0, message.length-4));
		});
	} else {
		callback('');
	}
}

//formats the result of the query in a table fashion
function formatResponseTable(result, callback) {
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
			message += '<th>TMB</th>'
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
				var queryResult = jsonQuery('[*patients = ' + result[i]['id'] + '][TMB]', { data: data }).value;
				message += '<td>' + queryResult + '</td>';
				message += '</tr>';
			}
			
			message += '</tbody></table>';
			callback(message);
		});
	} else {
		callback('');
	}
}

//main function to handle user input
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
	          		readTMBContent(function (err, data) {
			            var queryResult = jsonQuery('[*TMB '+ entities['TMB'][0].value + ']', { data: data }).value;
						readContent(function(err, data2) {
				            var msg = '';
				            for (var i = 0; i < queryResult.length; i++) {
				            	var result = jsonQuery('study.patients[*id = '+ queryResult[i]['patients'] + ']', { data: data2 }).value;
				            	formatResponse(result, function(message) { 
									msg += message + '<br>';
								});
				            }
				            formatResponse(result, function(message) {
				            	send(msg.substring(0, msg.length-4));
				            });
				        });
	          		});
	          	}
          		break;
	      	}
    	} else {
	    	send('Sorry, I couldn\'t understand that.');
    	}
	});
}

function handleResultsTableMessage(question) {
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
					formatResponseTable(queryResult, function(message) {
						tableSend(message);
						console.log(message);
					});
          		});
          		break;
        		case 'show_studies':
          		readContent(function (err, data) {
		            var queryResult = jsonQuery('study[*' + createQuery(entities, keys) + ']', { data: data }).value;
            		formatResponseTable(queryResult, function(message) { 
						tableSend(message);
					});
          		});
          		case 'show_patients_tmb':
	          	if (Array.isArray(entities['TMB'])) {
	          		readTMBContent(function (err, data) {
			            var queryResult = jsonQuery('[*TMB '+ entities['TMB'][0].value + ']', { data: data }).value;
						readContent(function(err, data2) {
				            var msg = '<table id="table_msg"><tr><thead><th>ID</th><th>AGE</th><th>GENDER</th><th>EFFECTS</th><th>RESPONSE</th><th>TMB</th></tr></thead><tbody id="myTableBody">';
				            for (var i = 0; i < queryResult.length; i++) {
				            	var result = jsonQuery('study.patients[*id = '+ queryResult[i]['patients'] + ']', { data: data2 }).value;
				            	formatResponseTable(result, function(message) { 
									msg += message.substring(153, message.length-16);
								});
				            }
				            formatResponseTable(result, function(message) {
				            	tableSend(msg + '</tbody></table>');
				            	//emit filters in query
	        					var filterMsg = insertSpaces('TMB ' + entities['TMB'][0].value);
	        					nsp2.emit('filter-criteria', {msg: filterMsg});
				            });
				        });
	          		});
	          	}
          		break;
	      	}
    	} else {
	    	tableSend('Sorry, I couldn\'t understand that.');
    	}
	});
}