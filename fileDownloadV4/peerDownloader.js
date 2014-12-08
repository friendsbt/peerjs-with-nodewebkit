var settings = require('./settings');

var peerjsDownloader = function(fileInfo) {
  this.hash = fileInfo.hash;
  this.size = fileInfo.size;
  this.file_to_save = fileInfo.file_to_save;
};

peerjsDownloader.prototype.startFileDownload = function(){
  var totalparts = parseInt((this.size + settings.partsize-1) / settings.partsize);
  global.socket.emit('download', {
    hash: this.hash,
    totalparts: totalparts
  });
};

peerjsDownloader.prototype.pauseFileDownload = function(){
  global.socket.emit('setState', {
    hash: this.hash,
    state: settings.DownloadState.PAUSED
  });
};

peerjsDownloader.prototype.resumeFileDownload = function(){
  global.socket.emit('setState', {
    hash: this.hash,
    state: settings.DownloadState.DOWNLOADING
  });
};

peerjsDownloader.prototype.cancelFileDownload = function(){
  global.socket.emit('setState', {
    hash: this.hash,
    state: settings.DownloadState.CANCELED
  });
};

exports.peerjsDownloader = peerjsDownloader;