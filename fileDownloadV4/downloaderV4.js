// Node
var forwardDownloader = require('./forward').forwardDownloader;
var peerjsDownloader = require('./peerDownloader').peerjsDownloader;

var DOWNLOAD_OVER = settings.DownloadState['DOWNLOAD_OVER'],
    DOWNLOADING = settings.DownloadState['DOWNLOADING'],
    CANCELED = settings.DownloadState['CANCELED'],
    PAUSED = settings.DownloadState['PAUSED'],
    DOWNLOAD_ERR = settings.DownloadState['DOWNLOAD_ERR'],
    ALREADY_COMPLETE = settings.DownloadState['ALREADY_COMPLETE'];

var downloaders = global.downloaders;

function v4Downloader(fileInfo, my_uid, uploader_uids, e,
        downloadOverCallback, downloadProgressCallback) {
    this.innerDownloader = new peerjsDownloader(fileInfo, my_uid, uploader_uids, e,
        downloadOverCallback, downloadProgressCallback);
    this.states = {
        status: DOWNLOADING,
        progress: 0,
        error: null
    };
}

v4Downloader.prototype.startFileDownload = function() {
    // update v4Downloader's state in innerDownloader
    this.innerDownloader.startFileDownload(this.states);
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
};

v4Downloader.prototype.useForward = function() {
    // can't use Peerjs so use forward mode
    // TODO: safe delete this.innerDownloader, simple delete may leak memory
    var states = this.states;
    delete this.states;
    delete this.innerDownloader;
    this.innerDownloader = new forwardDownloader(fileInfo, my_uid, uploader_uids,
                                e, downloadOverCallback, downloadProgressCallback);
    this.states = Object.copy(states);
    this.innerDownloader.startFileDownload();
};

exports.downloadFile = function(fileInfo, my_uid, uploader_uids,
                                e, downloadOverCallback, downloadProgressCallback) {
    var d = new v4Downloader(fileInfo, my_uid, uploader_uids, e,
        downloadOverCallback, downloadProgressCallback);
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
    delete downloaders[hash];
};
