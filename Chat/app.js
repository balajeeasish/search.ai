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

//run the server at port 8080
port = 8080;
server.listen(port, function() {
  console.log('Chat server running at port: ' + port);
});

//connect HTML file to server
app.get('/', function(require, resolve){
  resolve.sendFile(__dirname + '/index.html')
});

//connect css 'static' files to server
app.use(express.static(__dirname + '/public'));

//call Wit API with the SERVER_ACCESS_TOKEN
const Wit = require('node-wit').Wit;
const wit = new Wit({accessToken: 'BJK4FO5VSSJFSQ2324HTQFWQ6SPO5UQD'});

//set up json-query
var jsonQuery = require('json-query');

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

//parse JSON files for data in an async function but sync reading the files in the dir
var fs = require('fs');
const mainFolder = 'db/'; /* main directory with data */
const mainFile = 'subjects.json'; /* main file with main headers */
var fileArr = []; /* array to store names of files, except main file */

//read main file
function readContent(callback) {
  fs.readFile('db/' + mainFile, 'utf8', function (err, data) {
    if (err) throw err;
    var obj = JSON.parse(data);
    callback(null, obj);
  });
}
//read other files than main file in the dir
fs.readdirSync(mainFolder).forEach(file => {
  if (file == mainFile || file == '.DS_Store') {
    return;
  } else {
    fileArr.push(file);
  }
});
//parse through the files in the dir
function readFiles(callback) {
  for (var i = 0; i < fileArr.length; i++) {
    fs.readFile(mainFolder + fileArr[i], 'utf-8', function(err, data) {
      if (err) throw err;
      var obj = JSON.parse(data);
      callback(null, obj);
    });
  }
}

//send bot messages by emitting 'bot message'
function send(message) {
  if (message == '') {
    nsp.emit('bot message', {msg: 'Sorry, no found result.'});
  } else {
    nsp.emit('bot message', {msg: message});
  }
}

//differentiate the elements of two arrays using a filter
Array.prototype.diff = function(a) {
  return this.filter(function(i) {return a.indexOf(i) < 0;});
};

//Insert space in between words to prep entity names to query
function insertSpaces(s, callback) {
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
  s = s.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
  return s;
}

//create the initial query statements for the json-query module
function createQuery(entities, keys) {
  var query = '';
  if (keys.length == 0) {
    return query;
  } else {
    for (var i = 0; i < keys.length; i++) {
      //insertSpaces() gives spaces to the entity keys to properly query the JSON files
      if (keys[i] == 'TMB' || keys[i] == 'ASM') {
        query += insertSpaces(keys[i]) + entities[keys[i]][0].value + ' & ';
      } else {
        query += insertSpaces(keys[i]) + '=' + entities[keys[i]][0].value + ' & ';
      }
    }
  }
  //return query statement without the last ' & '
  return query.substring(0, query.length-3);
}

//create final query statement for format response with ID's
function createFinalQuery(results) {
  var query = '';
  if (results.length > 0) {
    for (var i = 0; i < results.length; i++) {
      query += 'Subject ID=' + results[i] + ' | ';
    }
    return query.substring(0, query.length-3);
  } else {
    return 'null';
  }
}

//formats the result of the query in a readable fashion
function formatResponse(result, mainHeaders, otherHeaders, callback) {
  if (result.length > 0) {
    //start out message
    var message = '';
    var keys = '';
    //add otherHeaders to keys if it exists
    if (otherHeaders.length > 0) {
      keys = mainHeaders.concat(otherHeaders);
    } else {
      keys = mainHeaders;
    }
    //set a bool
    var canCallback = true;

    readContent(function (err, data) {
      readFiles(function (err, content) {
        //get values from the result of the query
        var firstQuery = jsonQuery('[*' + createFinalQuery(result) + ']', { data: data }).value;
        if (otherHeaders.length > 0) {
          var secondQuery = jsonQuery('[*' + createFinalQuery(result) + ']', { data: content }).value;
          //only if the secondQuery has defined values, send callback message
          if (typeof secondQuery[0] == 'undefined') {
            canCallback = false;
          } else {
            if (typeof secondQuery[0][insertSpaces(otherHeaders[0])] == 'undefined') {
              canCallback = false;
            } else {
              canCallback = true;
            }
          }
        }
        //print patient information in clusters with line breaks in the results
        if (canCallback) {
          for (var i = 0; i < firstQuery.length; i++) {
            for (var j = 0; j < mainHeaders.length; j++) {
              //insertSpaces for mainHeaders
              mainHeaders[j] = insertSpaces(mainHeaders[j]);
              //if the value is an array, print length
              if (Array.isArray(firstQuery[i][mainHeaders[j]])) {
                var value = firstQuery[i][mainHeaders[j]].length;
              } else {
                var value = firstQuery[i][mainHeaders[j]];
              }
              message += mainHeaders[j].toUpperCase() + ': ' + value + '<br>';
            }
            //if otherHeaders exists, print that information too
            if (otherHeaders.length > 0) {
              for (var j = 0; j < otherHeaders.length; j++) {
                //insertSpaces for otherHeaders
                otherHeaders[j] = insertSpaces(otherHeaders[j]);
                //if the value is an array, print length
                if (Array.isArray(secondQuery[i][otherHeaders[j]])) {
                  var value = secondQuery[i][otherHeaders[j]].length;
                } else {
                  var value = secondQuery[i][otherHeaders[j]];
                }
                message += otherHeaders[j].toUpperCase() + ': ' + value + '<br>';
              }
            }
            message += '<br>';
          }
          //callback message
          callback(message.substring(0, message.length-4));
          canCallback = false;
        }
      });
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
      //switch-case statement for different intents
      switch (entities['intent'][0].value) {
        case 'show_patients':
        //remove 'intent' entity
        keys.splice( keys.indexOf('intent'), 1 );

        var mainHeaders = ['StudyID', 'SubjectID', 'Sex', 'DiagnosisAge', 'Race']; /* main headers that always show for table ** no spaces ** */
        var otherHeaders = keys.diff(mainHeaders); /* if user queries for headers that are not the main */
        var existingHeaders = keys.diff(otherHeaders); /* the headers the user queried that are mainHeaders */

        readContent(function (err, data) {
          //initial query results of existingHeaders the user's query
          var firstQuery = jsonQuery('[*' + createQuery(entities, existingHeaders, true) + '][Subject ID]', { data: data }).value;
          //if otherHeaders query for those
          if (otherHeaders.length > 0) {
            //null counter to see if no results exist in all files
            var nullCounter = 0;
            readFiles(function (err, content) {
              var secondQuery = jsonQuery('[*' + createQuery(entities, otherHeaders, false) + '][Subject ID]', { data: content }).value;
              //remove results that differ from the firstQuery results
              var someDiff = secondQuery.diff(firstQuery);
              for (var i = 0; i < someDiff.length; i++) {
                secondQuery.splice( secondQuery.indexOf(someDiff[i]), 1 );
              }
              //if secondQuery has results, format the results
              if (secondQuery != '') {
                formatResponse(secondQuery, mainHeaders, otherHeaders, function (message) {
                  send(message);
                });
              } else {
                nullCounter++;
                //only if there are no results in all the queries, then send error message
                if (nullCounter == fileArr.length) {
                  send('');
                }
              }
            });
          } else {
            formatResponse(firstQuery, mainHeaders, otherHeaders, function (message) {
              send(message);
            });
          }
        });
        break;
        default:
        send('$intent');
        break;
      }
    } else {
      send('Sorry, I couldn\'t understand that.');
    }
    //print elapsed time
    elapsed_time('Chat: ' + question.trim());
  });
}
