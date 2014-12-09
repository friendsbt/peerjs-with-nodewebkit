var fs = require('fs');
var raf = require('random-access-file');

var downloaders = {};  // node 环境中保存所有downloader
global.downloaders = downloaders;

var forwardDownloader = require('./forward').forwardDownloader;
var peerjsDownloader = require('./peerDownloader').peerjsDownloader;
var settings = require('./settings');

var DOWNLOAD_OVER = settings.DownloadState['DOWNLOAD_OVER'],
    DOWNLOADING = settings.DownloadState['DOWNLOADING'],
    CANCELED = settings.DownloadState['CANCELED'],
    PAUSED = settings.DownloadState['PAUSED'],
    DOWNLOAD_ERR = settings.DownloadState['DOWNLOAD_ERR'],
    ALREADY_COMPLETE = settings.DownloadState['ALREADY_COMPLETE'];

var browserWindow;
exports.initWindow = function(window) {
  browserWindow = window;
};

function v4Downloader(fileInfo, my_uid, uploader_uids, e,
        downloadOverCallback, downloadProgressCallback) {
  this.innerDownloader = new peerjsDownloader(fileInfo);
  this.hash = fileInfo.hash;
  this.size = fileInfo.size;
  this.file_to_save = fileInfo.file_to_save;
  this.file_to_save_tmp = fileInfo.file_to_save + '.tmp';
  this.uploaderUidList = uploader_uids.split(',');
  this.descriptor = raf(d.file_to_save_tmp);
  this.complete_parts = 0;
  this.total_parts = parseInt((fileInfo.size+settings.partsize-1)/settings.partsize);
  this.e = e;
  this.downloadOverCallback = downloadOverCallback;
  this.downloadProgressCallback = downloadProgressCallback;
  this.states = {
    status: DOWNLOADING,
    progress: 0,
    error: null
  };
}

v4Downloader.prototype.startFileDownload = function() {
  // update v4Downloader's state in innerDownloader
  this.innerDownloader.startFileDownload();
};

v4Downloader.prototype.pauseFileDownload = function() {
  this.states.status = PAUSED;
  this.innerDownloader.pauseFileDownload(this.states);
};

v4Downloader.prototype.resumeFileDownload = function() {
  this.states.status = DOWNLOADING;
  this.innerDownloader.resumeFileDownload(this.states);
};

v4Downloader.prototype.cancelFileDownload = function() {
  this.states.status = CANCELED;
  this.innerDownloader.cancelFileDownload(this.states);
  if (fs.existsSync(this.file_to_save_tmp)) {
    fs.unlinkSync(this.file_to_save_tmp);
  }
  // TODO: update nedb
};

v4Downloader.prototype.useForward = function() {
  // can't use Peerjs so use forward mode
  // TODO: safe delete this.innerDownloader, simple delete may leak memory
  delete this.innerDownloader;
  this.innerDownloader = new forwardDownloader(
    this.fileInfo,
    this.my_uid,
    this.uploaderUidList,
    this.e,
    this.downloadOverCallback,
    this.downloadProgressCallback
  );
  this.innerDownloader.startFileDownload();
};

exports.downloadFile = function(fileInfo, my_uid, uploader_uids,
                                e, downloadOverCallback, downloadProgressCallback) {
  var d = new v4Downloader(
    fileInfo,   // {size, hash, file_to_save}
    my_uid,
    uploader_uids,
    e,
    downloadOverCallback,
    downloadProgressCallback
  );
  downloaders[fileInfo.hash] = d;
  d.startFileDownload();
};

exports.pauseFileDownload = function(hash) {
  downloaders[hash].pauseFileDownload();
};

exports.resumeFileDownload = function(hash) {
  downloaders[hash].resumeFileDownload();
};

exports.cancelFileDownload = function(hash) {
  downloaders[hash].cancelFileDownload();
  // TODO: clear downloaders
};
