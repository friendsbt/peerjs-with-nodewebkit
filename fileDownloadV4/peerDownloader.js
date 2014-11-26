var settings = require('./settings');

var peerjsDownloader = function(fileInfo) {
  this.hash = fileInfo.hash;
  this.size = fileInfo.size;
  this.file_to_save = fileInfo.file_to_save;
};

peerjsDownloader.prototype.startFileDownload = function(){
  var totalparts = parseInt((this.size + settings.partsize-1) / settings.partsize);
  global.socket.emit('download', {hash: this.hash, totalparts: totalparts});
};

exports.peerjsDownloader = peerjsDownloader;