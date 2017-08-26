//set up express and socket
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);

//run the server at port 8080
port = 8080;
server.listen(port);
console.log('Server running at: ' + port);

//call Wit API with the SERVER_ACCESS_TOKEN
const Wit = require('node-wit').Wit;
const wit = new Wit({accessToken: 'KHTO5ZH3NCVM7GVHNTTIQCTBKCAID5HF'});

//set up json-query
var jsonQuery = require('json-query');

//connect HTML file to server
app.get('/', function(require, resolve){
 	resolve.sendFile(__dirname + '/index.html')
});

//connect css 'static' files to server
app.use(express.static(__dirname + '/public'));

/* THE USERNAME VARIABLE NEEDS TO BE REPLACED WITH THE USERNAME OF THE LOGGED IN PERSON */
//create a namespace for the chat
var username = "username";
var nsp = io.of('/' + username);
nsp.on('connection', function(socket){
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

//send bot messages by emitting 'bot message'
function send(message) {
	if (message == '') {
	    nsp.emit('bot message', {msg: 'Sorry, no found result.'});
  	} else {
	    nsp.emit('bot message', {msg: message});
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
        	query += keys[i] + '=' + entities[keys[i]][0].value + ' & ';
    	}
    }
    //return query statement without the last ' & '
    return query.substring(0, query.length-3);
  	}
}

//formats the result of the query in a readable fashion
function formatResponse(result, callback) {
	var message = '';
	for (var i = 0; i < result.length; i++) {
		for (var j = 0; j < Object.keys(result[i]).length; j++) {
			var key = Object.keys(result[i])[j];
			//Capitalize the first letter of the keys
			var formattedKey = key.charAt(0).toUpperCase() + key.slice(1);
			//if a property is an array, print length of array instead of the array
			if (Array.isArray(Object.values(result[i])[j])) {
				var value = Object.values(result[i])[j].length;
			} else {
				var value = Object.values(result[i])[j];
			}
			message += formattedKey + ': ' + value + '<br>';
		}
		message += '<br>'
	}
	//return formatted message without the last '<br>'
	callback(message.substring(0, message.length-4));
}

function formatResponseTable(result, callback) {
	var message = '<table style="width:100%; border: 2px solid black;">';
	var keys = Object.keys(result[0]);
	
	message += '<tr style="border: 2px solid black; background-color: #6eb0d8;">';
	for (var i = 0; i < keys.length; i++) {
		var key = keys[i].toUpperCase();
		var formattedKey = key.charAt(0).toUpperCase() + key.slice(1);

		message += '<th style="text-align:center; padding: 5px 0px 5px 0px; border: 1px solid black;">' + key + '</th>';
	}
	message += '</tr>';
	
	for (var i = 0; i < result.length; i++) {
		message += '<tr style="background-color: #73b8e2;">';
		for (var j = 0; j < Object.keys(result[i]).length; j++) {
			//if a property is an array, print length of array instead of the array
			if (Array.isArray(Object.values(result[i])[j])) {
				var value = Object.values(result[i])[j].length;
			} else {
				var value = Object.values(result[i])[j];
			}
			message += '<td style="text-align: center; padding: 5px 0px 5px 0px; border: 1px solid black;">' + value + '</td>';
		}
		message += '</tr>';
	}
	
	message += '</table>';
	callback(message);
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
//            		formatResponse(queryResult, function(message) { 
//						send(message);
//					});
					formatResponseTable(queryResult, function(message) {
						send(message);
					});
					/*send('Check console');
					var result = jsonQuery('[*Requestable=Yes][Originating ID]', {data: data}).value;
					console.log(result);*/
          		});
          		break;
        		case 'show_studies':
          		readContent(function (err, data) {
		            var queryResult = jsonQuery('study[*' + createQuery(entities, keys) + ']', { data: data }).value;
            		formatResponse(queryResult, function(message) { 
						send(message);
					});
          		});
          		break;
	      	}
    	} else {
	    	send('Sorry, I couldn\'t understand that.');
    	}
	});
}