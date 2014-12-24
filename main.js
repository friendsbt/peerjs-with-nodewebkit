var fs = require('fs');
var Datastore = require('nedb');
global.parts_left_collection = new Datastore({filename: "parts_left", autoload: true});

process.on("uncaughtException", function(err){
  fs.appendFileSync('err.txt', err);
});

function main(window){
	var express = require("express");
	var app = express();
	var http = require('http');
  var randomAccessFile = require("random-access-file");

	var server = http.createServer(app);
	var io = require('socket.io').listen(server);
  server.listen(12345);

	app.use(express.static(__dirname + '/static'));
	app.set("views", __dirname+"/views/");
	app.set("view engine", "jade");
	app.set("view options", {layout:false});
	app.use(express.bodyParser());
	app.use(express.cookieParser());
	app.use(express.logger());
	app.get("/", function(req,res){
		res.render("index");
	});

  var config = JSON.parse(fs.readFileSync('config.json'));
  var hash = config.hash;
  var size = config.size;
  var filepath = config.filepath;
  global.hash = hash;
  global.filepath = filepath;
  var my_uid = JSON.parse(fs.readFileSync('user.json')).user;

	io.sockets.on('connection', function(socket) {
    global.socket = socket;
    socket.emit("initpeer", my_uid);  // create Peer for download/upload
    var fileDowloadV4 = require('./fileDownloadV4/downloaderV4.js');
    var fileUploadV4 = require('./fileDownloadV4/uploaderV4.js');

    // init window object for debugging, remove this when moved into FBT
    fileUploadV4.initWindow(window);
    fileDowloadV4.initWindow(window);
    require('./fileDownloadV4/peerDownloader.js').initWindow(window);
    require('./res/res_api.js').initWindow(window);

    if (my_uid === 'lizhihua') {
      var uploader_uids = 'zuoyao';
      var fileInfo = {hash: hash, size: size, file_to_save: filepath};
      fileDowloadV4.downloadFile(fileInfo, my_uid, uploader_uids);

      // test pause and resume
      /*
      setTimeout(function(){
        fileDowloadV4.pauseFileDownload(hash);
        setTimeout(function(){
          fileDowloadV4.resumeFileDownload(hash);
        }, 5000);
      }, 10000);
      */
    }
    if (my_uid === 'zuoyao') {
      //var downloader_uid = 'lizhihua';
      //fileUploadV4.initV4Upload(my_uid, downloader_uid, hash, size);

      var ChartRoomTalker = require('./fileDownloadV4/ChartRoom-talker.js');
      var uploader = new ChartRoomTalker('http://182.92.212.237:8099', '123');
      uploader.onError = function(error) {
        console.log(error);
      };
      uploader.onMessage = function(sUid, message) {
        var filehash = message.filehash;
        var filesize = message.filesize;
        var pieceindex = message.pieceindex;
        var piecesize = message.piecesize;

        var file = randomAccessFile(filepath);
        var isLastPiece = (filesize-pieceindex*piecesize < piecesize);
        var readsize = isLastPiece ? filesize-pieceindex*piecesize : piecesize;

        if(readsize <= 0) {
          uploader.send(sUid, {
            filehash: filehash,
            filesize: filesize,
            pieceindex: pieceindex,
            piecesize: readsize,
            piecehash: null,
            data: null //EOF
          });
          return;
        }

        file.read(pieceindex*piecesize, readsize, function(error, data) {
          if(error) {
            console.log(error);
            return process.exit(1);
          }

          uploader.send(sUid, {
            filehash: filehash,
            filesize: filesize,
            pieceindex: pieceindex,
            piecesize: readsize,
            piecehash: 11111,
            data: data
          });
          file.close();
        });
      }
    }
  });

}

exports.main = main;
