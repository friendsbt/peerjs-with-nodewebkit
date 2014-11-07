var forwardDownloader = require('./forward').forwardDownloader;
var peerjsDownloader = require('./peer').peerjsDownloader;

var downloaders = {};

function v4Downloader(manyattr, type) {
    this.innerDownloader = (function(){
        if (type === "peerjs")
            return new peerjsDownloader(manyattr);
        if (type === 'forward')
            return new forwardDownloader(manyattr);
    })();
}

v4Downloader.prototype.pauseFileDownload = function() {
    this.innerDownloader.pauseFileDownload();
};

v4Downloader.prototype.cancelFileDownload = function() {
    this.innerDownloader.cancelFileDownload();
};


exports.downloadFile = function(fileInfo, my_uid, uploader_uids, e, downloadOverCallback, downloadProgressCallback) {
    // determine whether to use forward
    var d = new v4Downloader(manyattr, type);  // type is peerjs or forward
    downloaders[fileInfo.hash] = d;
}

exports.pauseFileDownload = function(hash) {
    downloaders[hash].cancelFileDownload();
    delete downloaders[hash];
}

exports.cancelFileDownload = function(hash) {
    downloaders[hash].pauseFileDownload();
}
