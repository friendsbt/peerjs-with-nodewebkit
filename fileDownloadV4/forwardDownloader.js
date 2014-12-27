/* vim: set expandtab sw=2 ts=2 : */

var chatRoomTalker = require('./chatRoom-talker.js');
var randomAccessFile = require('random-access-file');
var res_api = require('../res/res_api');
var crypto = require('crypto');
var fs = require('fs');
var EventEmitter = require('events').EventEmitter;

function sleep(milliSeconds) {
  var startTime = new Date().getTime();
  while (new Date().getTime() < startTime + milliSeconds);
}

var forwardDownloader = module.exports = function(
  fileInfo,
  my_uid,
  uploaderUidList,
  e, 
  downloadOverCallback,
  downloadProgressCallback
) {
  this.DownloadState = {
    DOWNLOAD_OVER: 0,
    DOWNLOADING: 1,
    CANCELED: 2,
    PAUSED: 3,
    DOWNLOAD_ERR: 4,
    ALREADY_COMPLETE: 5
  };
  this.BLOCKSIZE = 1024*1024; // 1MB

  this.piecesize = 64*1024; //64KB
  this.pieceindex = 0;
  this.pieces_left = []; // Set by initPieces
  this.parts_left = []; // Set by startFileDownload
  this.complete_parts = [];
  this.lastTime = null; // Set by startFileDownload

  this.file_to_save = fileInfo.file_to_save;
  this.file_to_save_tmp = this.file_to_save + '.tmp';
  this.filesize = fileInfo.size;
  this.hash = fileInfo.hash;

  this.state = null;
  this.uploaderUidList = uploaderUidList;
  this.uploaderindex = 0;
  this.retrytime = 0;

  var that = this;

  this.downloader = new chatRoomTalker('http://182.92.212.237:8099', my_uid);
  this.downloader.onError = function(error) {
    if(error) {
      if(that.retrytime >= 3) {
        global.window.console.log('Cannot find valid uploader!');
        return;
      }

      sleep(3000);

      that.uploaderindex = (that.uploaderindex+1) % that.uploaderUidList.length;
      global.window.console.log('Retry uploader index: ' + that.uploaderUidList[that.uploaderindex]);
      if(that.uploaderindex === (that.uploaderUidList.length-1)) {
        that.retrytime++;
        global.window.console.log('Retry time: ' + that.retrytime);
      }
      that.resumeFileDownload();
    }
  };
  this.downloader.onMessage = function(sUid, message) {
    var done = function () {
       if(fs.existsSync(that.file_to_save_tmp)) { 
         fs.rename(that.file_to_save_tmp, that.file_to_save); 
       } 
    };

    if(that.state !== that.DownloadState.DOWNLOADING) {
      return;
    }
    // Reject unexpected block
    if((that.pieces_left.indexOf(message.pieceindex) < 0)
      || (message.hash !== that.hash)) {
      return;
    }

    // Hash validation
    /*
    var isHashCorrect
      = !message.piecehash || message.piecehash
      === crypto.createHash('md5').update(message.data).digest('hex');
    */
    var isHashCorrect = true;

    if(!message.data) { //EOF
      that.state = that.DownloadState.DOWNLOAD_OVER;
      done();
//      that.downloadOverCallback(that);
      return;
    }

    if(isHashCorrect) {
      var file = randomAccessFile(that.file_to_save_tmp, that.filesize);
      file.write(
        message.pieceindex*that.piecesize,
        message.data,
        function(error) {
          file.close();
          that.pieceindex++;

          if(message.piecesize < that.piecesize) {
            that.state = that.DownloadState.DOWNLOAD_OVER;
            done();
//            that.downloadOverCallback(that);
          }

          that.updatePartsLeft(message.pieceindex);

          // Calculate speed
          var download_Bs = that.filesize - (that.pieces_left.length-that.pieceindex)*that.piecesize;
          var progress = download_Bs / that.filesize;
          var downloadSpeed = (function(nowTime) {
            var speed = that.piecesize / (nowTime - that.lastTime);
            that.lastTime = nowTime;
            return speed;
          }(Date.now() / 1000));
          global.window.console.log('download_Bs: ' + download_Bs);
          global.window.console.log('progress: ' + progress);
          global.window.console.log('downloadSpeed: ' + downloadSpeed);

          if(that.state === that.DownloadState.DOWNLOADING) {
            if(that.pieces_left.length) {
              //that.downloadProgressCallback(download_Bs, progress, downloadSpeed);

              // Get the next part(block)
              // Which uploader should I use?
              that.downloader.send(that.uploaderUidList[that.uploaderindex], {
                hash: that.hash,
                filesize: that.filesize,
                pieceindex: that.pieces_left[that.pieceindex],
                piecesize: that.piecesize
              });
            }
          }
        }
      );
    }
    else {
      global.window.console.log('hash incorrect');
    }
  };

  this.downloadOverCallback = downloadOverCallback;
  this.downloadProgressCallback = downloadProgressCallback;
};


forwardDownloader.prototype.__proto__ = EventEmitter.prototype;


forwardDownloader.prototype.updatePartsLeft = function(pieceindex) {
  if(this.state === this.DownloadState.DOWNLOAD_OVER) {
    res_api.remove_part_from_parts_left(this.hash, this.blockindex);
    
    this.pieceindex = 0;
    this.pieces_left = [];
    this.parts_left = [];
    this.complete_parts = [];
  }
  else {
    var index = this.pieces_left.indexOf(pieceindex);
    if(index > -1) {
      var piecenum = this.BLOCKSIZE / this.piecesize;
      if((this.pieceindex + 1) % piecenum === 0) {
        var index = Math.floor(this.pieceindex / piecenum);
        var blockindex =  this.parts_left[index];

        this.complete_parts.push(blockindex);
        res_api.remove_part_from_parts_left(this.hash, this.blockindex);
      }
    }
  }
};


forwardDownloader.prototype.initPieces = function(parts_left) {
  this.pieceindex = 0;
  this.parts_left = parts_left;
  this.pieces_left = (function makePieces(that) {
    var pieces = [];
    that.parts_left.forEach(function(blockindex) {
      var piecenum = that.BLOCKSIZE/that.piecesize;
      for(var pieceindex = 0; pieceindex < piecenum; pieceindex++) {
        pieces.push(blockindex * piecenum + pieceindex);
      }
    });
    return pieces;
  }(this));
  this.pieces_flag = (function initPiecesFlag(that) {
    var flags = [];
    for(var pieceindex in that.pieces_left) {
      flags.push(0); // Set flag to 1 when piece downloaded
    }
    return flags;
  }(this));
};


forwardDownloader.prototype.startFileDownload = function(parts_left) {
  this.state = this.DownloadState.DOWNLOADING;
  this.lastTime = Date.now() / 1000;
  this.initPieces(parts_left);

  var that = this;
  that.downloader.send(this.uploaderUidList[this.uploaderindex], {
    hash: that.hash,
    filesize: that.filesize,
    pieceindex: that.pieces_left[that.pieceindex],
    piecesize: that.piecesize //Download block piece by piece
  });
};


forwardDownloader.prototype.pauseFileDownload = function() {
  this.state = this.DownloadState.PAUSED;
};


forwardDownloader.prototype.resumeFileDownload = function() {
  this.state = this.DownloadState.DOWNLOADING;
  this.retrytime = 0;
  this.startFileDownload(this.parts_left);
};


forwardDownloader.prototype.cancelFileDownload = function() {
  this.state = this.DownloadState.CANCELED;
  if(fs.existsSync(this.file_to_save)) {
    fs.unlinkSync(this.file_to_save);
    global.window.console.log('Deleted ' + this.file_to_save);
  }
  else if(fs.existsSync(this.file_to_save_tmp)) {
    fs.unlinkSync(this.file_to_save_tmp);
    global.window.console.log('Deleted ' + this.file_to_save_tmp);
  }

  res_api.remove_record_from_parts_left(this.hash);

  this.pieceindex = 0;
  this.pieces_left = [];
  this.parts_left = [];
  this.complete_parts = [];
};


forwardDownloader.prototype.on('pause', function() {
  this.pauseFileDownload();
});


forwardDownloader.prototype.on('resume', function() {
  this.resumeFileDownload();
});


forwardDownloader.prototype.on('cancel', function() {
  this.cancelFileDownload();
});
