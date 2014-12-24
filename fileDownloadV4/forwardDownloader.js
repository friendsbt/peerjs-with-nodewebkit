/* vim: set expandtab sw=2 ts=2 : */

var ChartRoomTalker = require('./ChartRoom-talker.js');
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
  this.done_parts = [];

  this.filename = fileInfo.file_to_save;
  this.filenametmp = this.filename + '.tmp';
  this.filesize = fileInfo.size;
  this.filehash = fileInfo.hash;

  this.state = null;
  this.uploaderUidList = uploaderUidList;
  this.uploaderindex = 0;
  this.retrytime = 0;

  var that = this;

  this.downloader = new ChartRoomTalker('http://182.92.212.237:8099', my_uid);
  this.downloader.onError = function(error) {
    if(error) {
      if(that.retrytime >= 3) {
        console.log('Cannot find valid uploader!');
        return;
      }

      sleep(3000);

      that.uploaderindex = (that.uploaderindex+1) % that.uploaderUidList.length;
      console.log('Retry uploader index: ' + that.uploaderUidList[that.uploaderindex]);
      if(that.uploaderindex === (that.uploaderUidList.length-1)) {
        that.retrytime++;
        console.log('Retry time: ' + that.retrytime);
      }
      that.resumeFileDownload();
    }
  };
  this.downloader.onMessage = function(sUid, message) {
    if(that.state !== that.DownloadState.DOWNLOADING) {
      return;
    }
    // Reject unexpected block
    if((that.pieces_left.indexOf(message.pieceindex) < 0)
      || (message.filehash !== that.filehash)) {
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
      that.downloadOverCallback(that);
      return;
    }

    if(isHashCorrect) {
      var file = randomAccessFile(that.filenametmp, that.filesize);
      file.write(
        message.pieceindex*that.piecesize,
        message.data,
        function(error) {
          file.close();
          that.pieceindex++;

          if(message.piecesize < that.piecesize) {
            that.state = that.DownloadState.DOWNLOAD_OVER;
            that.downloadOverCallback(that);
          }

          that.updatePartsLeft(message.pieceindex);

          if(that.state === that.DownloadState.DOWNLOADING) {
            if(that.pieces_left.length) {
              that.downloadProgressCallback(that);

              // Get the next part(block)
              // Which uploader should I use?
              that.downloader.send(that.uploaderUidList[that.uploaderindex], {
                filehash: that.filehash,
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
      console.log('hash incorrect');
    }
  };

  this.downloadOverCallback = downloadOverCallback;
  this.downloadProgressCallback = downloadProgressCallback;
};


forwardDownloader.prototype.__proto__ = EventEmitter.prototype;


forwardDownloader.prototype.updatePartsLeft = function(pieceindex) {
  if(this.state === this.DownloadState.DOWNLOAD_OVER) {
    res_api.remove_part_from_parts_left(this.filehash, this.blockindex);
    
    this.pieceindex = 0;
    this.pieces_left = [];
    this.parts_left = [];
    this.done_parts = [];
  }
  else {
    var index = this.pieces_left.indexOf(pieceindex);
    if(index > -1) {
      var piecenum = this.BLOCKSIZE / this.piecesize;
      if((this.pieceindex + 1) % piecenum === 0) {
        var index = Math.floor(this.pieceindex / piecenum);
        var blockindex =  this.parts_left[index];

        this.done_parts.push(blockindex);
        res_api.remove_part_from_parts_left(this.filehash, this.blockindex);
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
  this.initPieces(parts_left);

  var that = this;
  if(parts_left.length) {
    // Which uploader should I use?
    that.downloader.send(this.uploaderUidList[this.uploaderindex], {
      filehash: that.filehash,
      filesize: that.filesize,
      pieceindex: that.pieces_left[that.pieceindex],
      piecesize: that.piecesize //Download block piece by piece
    });
  }
  else {
    this.state = this.DownloadState.DOWNLOAD_OVER;
    this.downloadOverCallback(this);
  }
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
  if(fs.existsSync(this.filename)) {
    fs.unlinkSync(this.filename);
    console.log('Deleted ' + this.filename);
  }
  else if(fs.existsSync(this.filenametmp)) {
    fs.unlinkSync(this.filenametmp);
    console.log('Deleted ' + this.filenametmp);
  }

  res_api.remove_record_from_parts_left(this.filehash);

  this.pieceindex = 0;
  this.pieces_left = [];
  this.parts_left = [];
  this.done_parts = [];
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
