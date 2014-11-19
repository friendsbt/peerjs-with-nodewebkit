var fs = require('fs');
var path = require('path');
var crc = require(path.join(global.exec_path,'crc'));
var BSON = require(path.join(global.exec_path,'buffalo'));
var settings = require(global.get_path('settings.js'));
var res_api = require(global.get_path("res/res_api"));

var DOWNLOAD_OVER = settings.DownloadState['DOWNLOAD_OVER'],
    DOWNLOADING = settings.DownloadState['DOWNLOADING'],
    CANCELED = settings.DownloadState['CANCELED'],
    PAUSED = settings.DownloadState['PAUSED'],
    DOWNLOAD_ERR = settings.DownloadState['DOWNLOAD_ERR'],
    ALREADY_COMPLETE = settings.DownloadState['ALREADY_COMPLETE'],
    mylog = settings.mylog;

function hasFileContent(jsonData){
    return "content" in jsonData;
}


function arrayEqual(a, b){
    // assume a.length == b.length
    Object.keys(a).forEach(function(key) {
        if (a[key] !== b[key]) return false;
    });
    return true;
}


function allOne(a) {
    Object.keys(a).forEach(function(key) {
        if (a[key] !== 1) {
            console.log("allOne false");
            return false;
        }
    });
    return true;
}


function get_checksum(bf) {
    var crc32 = new crc.CRC32();
    crc32.update(bf);
    return crc32.checksum(); // int
}


function crc_check(data, checksum) {
    var crc32 = new crc.CRC32();
    crc32.update(data);
    return crc32.checksum() === checksum;
}


function diff_block(tobe_check, callback) {
    if (tobe_check.length === 0) {
        // 这种情况在interval未到但是已经校验完该part的block时出现
        callback();
        return;
    }
    var BLOCK_SIZE = settings.BLOCK_SIZE;
    var totalblocks = global.totalblocks;
    var bf2 = Buffer(BLOCK_SIZE);

    function compare_block(i, fd2) {
        try {
            var blockID = tobe_check[i];
            fs.read(fd2, bf2, 0, BLOCK_SIZE, blockID*BLOCK_SIZE, function (err, bytesRead, bf2) {
                var result;
                if (tobe_check[i] === totalblocks - 1) {
                    bf2 = bf2.slice(0, bytesRead);
                    result = crc_check(bf2, global.checksum_record[blockID]);
                }
                else
                    result = crc_check(bf2, global.checksum_record[blockID]);
                if (result === false) {
                    fs.appendFileSync(mylog, "block "+blockID+" not equal!");
                }
                else {
                    tobe_check.splice(i, 1);
                }
                if (i > 0) {
                    // 考虑到splice对index的影响, 采用逆序递归
                    compare_block(i - 1, fd2);
                }
                else {
                    callback();
                }
            });
        }
        catch (e){
            fs.appendFileSync(mylog, e.message);
        }
    }

    compare_block(tobe_check.length-1, global.fd2);
}


function addr2bytes(addr, nat_type_id) {
    var host = addr.ip;  // "0.0.0.0"
    var port = addr.port;  // int 23456
    var bytes = Buffer(7);  // 和之前不同,现在用7个字节
    var first4bytes = Buffer(host.split('.'));  // 用数字初始化
    var byte5 = Math.floor(port/256);
    var byte6 = port - byte5 * 256;
    var next2bytes = Buffer([byte6, byte5]);
    first4bytes.copy(bytes);
    next2bytes.copy(bytes, 4);
    // 因为id不会超过4, 所以写最后一个字节就行, 1=0x33, 注意是字符串不是Int
    bytes.write(nat_type_id.toString(), 6);
    return bytes;
}


function bytes2addr(bytes) {
    var nat_type_id = bytes.readUInt8(6);  // 这是字符串不是Int
    var ip = Array();
    for (var i=0; i<4;i++) {
        ip.push(bytes.readUInt8(i));
    }
    ip = ip.join('.');
    var port = bytes.readUInt16LE(4);
    return [ip, port, nat_type_id];
}


function get_sourcefile_from_hash(res_hash_collection, hash, size, main) {
    // 服务器上传过来的是字符串类型的hash
    res_hash_collection.find({'verify': parseInt(hash)}, function(err, docs) {
        if (docs === null) {
            fs.appendFileSync(mylog,"no such file in res_hash, upload fail!\n");
        }
        else {
            docs.forEach(function(doc){
                var upload_file_path = doc.path;
                global.res_info_collection.findOne({path: upload_file_path}, function(err, doc) {
                    if (doc === null) {
                        fs.appendFileSync(mylog,"no such file in res_info, upload fail!\n");
                    }
                    else {
                        // add size check, in case two resources have the same hash value
                        if (doc.size === size) {
                            fs.appendFileSync(mylog, "upload filepath: " + upload_file_path + '\n');
                            main(upload_file_path, doc.size);
                        } else {
                            fs.appendFileSync(mylog, "hash equal, size differ: " + upload_file_path + '\n');
                        }
                    }
                });
            });
        }
    });
}

var lastDownloadState = {
    lastTime: Date.now()/1000,
    calcSpeed: function(nowTime) {
        var speed = settings.partsize/(nowTime - this.lastTime);
        this.lastTime = nowTime;
        return speed;
    }
};

function updateDownloadState() {
    // update_parts_left是异步操作,但是updateDownloadState会用在on.exit里面
    // 也就是说,那个时候未必能成功更新数据库。但是没关系,downloadState可以正常返回就行
    res_api.update_parts_left(global.hash, global.parts_left);
    if ([DOWNLOADING, PAUSED, CANCELED].indexOf(global.status) !== -1){
        if (!fs.existsSync(settings.CHECKSUM_RECORD_PATH)) {
            fs.mkdir(settings.CHECKSUM_RECORD_PATH);
        }
        fs.writeFileSync( // 保存checksum_record
            global.CHECKSUM_RECORD_FILE,
            BSON.serialize(global.checksum_record)
        );
    }
    // 注意,这里要用TOTAL_PARTS,因为total_parts会更新成parts_left
    var download_parts_count = global.TOTAL_PARTS - global.parts_left.length;
    var download_Bs = download_parts_count * settings.partsize;
    var progress = download_Bs / global.filesize;
    if (progress > 1){
        progress = 1;
        download_Bs = global.filesize; // 返回真实的下载大小
    }
    var downloadState = {
        'progress': progress,
        'download_Bs': download_Bs,
        'status': global.status
    };
    if (downloadState.status === DOWNLOAD_OVER) {
        downloadState.uids = global.real_uploader_uids; // "uid1,uid2"
    }
    if (global.status === DOWNLOADING) {
        if (global.totalparts > global.parts_left.length) // if at least download one part
            downloadState.speed = lastDownloadState.calcSpeed(Date.now()/1000);
        else
            downloadState.speed = 0;
    }
    return downloadState;
}

function handleUploaderOffline(uid) {
    /*
    handle uploader offline event
    case 1: uploader exit and downloader is notified by upper layer
    case 2: uploader timeout and send 'close' msg to downloader
     */
    global.allocator.userOffline(uid, function(stop){
        if (stop === true) {
            // no available client, cancel download
            fs.appendFileSync(mylog, 'no uploader left, exit\n');
            global.status = DOWNLOAD_ERR;
            process.send(updateDownloadState());
            setTimeout(function() {
                process.exit(0);
            }, 200);
        }
    });
}

exports.bytes2addr = bytes2addr;
exports.addr2bytes = addr2bytes;
exports.hasFileContent = hasFileContent;
exports.arrayEqual = arrayEqual;
exports.allOne = allOne;
exports.get_checksum = get_checksum;
exports.crc_check = crc_check;
exports.diff_block = diff_block;
exports.get_sourcefile_from_hash = get_sourcefile_from_hash;
exports.updateDownloadState = updateDownloadState;
exports.lastDownloadState = lastDownloadState;
exports.handleUploaderOffline = handleUploaderOffline;