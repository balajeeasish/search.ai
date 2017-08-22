//set up express and socket
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);

//run the server
port = 8080;
server.listen(port);
console.log('Server running at: ' + port);

//call Wit API with SERVER_ACCESS_TOKEN
const Wit = require('node-wit').Wit;
const wit = new Wit({accessToken: 'KHTO5ZH3NCVM7GVHNTTIQCTBKCAID5HF'});

//set up json-query
var jsonQuery = require('json-query');

//parse JSON files for data
var fs = require('fs');
function readContent(callback) {
  fs.readFile('db/study.json', 'utf8', function (err, data) {
    if (err) throw err;
    var obj = JSON.parse(data);
    callback(null, obj);
  });
}

//send messages
function send(message) {
  if (message == '') {
    nsp.emit('bot message', {msg: 'Sorry, no found result.'});
  } else {
    nsp.emit('bot message', {msg: message});
  }
}

//create the query for json-query
function createQuery(entities, keys) {
  var query = '';
  keys.splice(keys.indexOf('intent'), keys.indexOf('intent')+1);
  if (keys.length == 0) {
    return query;
  } else {
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] == 'start') {
        query += 'age' + '>=' + entities[keys[i]][0].value + ' & ';
      } else if (keys[i] == 'end') {
        query += 'age' + '<=' + entities[keys[i]][0].value + ' & ';
      } else {
        query += keys[i] + '=' + entities[keys[i]][0].value + ' & ';
      }
    }
    return query.substring(0, query.length-3);
  }
}

//formats the response of the query
function formatResponse(result, callback) {
  var message = '';
  for (var i = 0; i < result.length; i++) {
    for (var j = 0; j < Object.keys(result[i]).length; j++) {
      var key = Object.keys(result[i])[j];
      var formattedKey = key.charAt(0).toUpperCase() + key.slice(1);
      if (Array.isArray(Object.values(result[i])[j])) {
        var value = Object.values(result[i])[j].length;
      } else {
        var value = Object.values(result[i])[j];
      }
      message += formattedKey + ': ' + value + '<br>';
    }
    message += '<br>'
  }
  callback(message.substring(0, message.length-4));
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
          break;
        default:
          send(`${intent.value}`);
          break;
      }
    } else {
      send('Sorry, I couldn\'t understand that.');
    }
  });
}

//connect HTML file to server
app.get('/', function(require, resolve){
  resolve.sendFile(__dirname + '/index.html')
});

//connect css 'static' files to server
app.use(express.static(__dirname + '/public'));

//create a namespace
var username = "username";
var nsp = io.of('/' + username);
nsp.on('connection', function(socket){
  //Send message
  socket.on('send message', function(data){
    nsp.emit('new message', {msg: data});
    handleMessage(data);
  });
});