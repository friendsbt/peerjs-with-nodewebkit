// NODE

// global.socket.emit("upload")
function emit_upload_msg() {
    socket.emit('send', function () {
        var filesize = fs.statSync('Advice.mp3').size;
        var totalFullBlocks = parseInt((filesize - BLOCK_SIZE + 1) / BLOCK_SIZE);
        var last_block_size = filesize - BLOCK_SIZE * totalFullBlocks;
        window.console.log('totalblock:' + totalFullBlocks.toString());
        window.console.log('lastblocksize:' + last_block_size.toString());
        var index = 0;
        var start = 0;
        var intervalObj = setInterval(function () {
            if (index > totalFullBlocks - 1) {
                clearInterval(intervalObj);
                file.read(start, last_block_size, function (err, data) {
                    socket.emit('send', {index: index, data: toArrayBuffer(data)});
                    window.console.log("last block sent");
                    file.close();
                    setTimeout(function () {
                        socket.emit('control', {type: "disconnect"});
                    }, 100);
                });
            } else {
                file.read(start, BLOCK_SIZE, function (err, data) {
                    socket.emit('send', {index: index, data: toArrayBuffer(data)});
                    start += BLOCK_SIZE;
                    index++;
                });
            }
        }, 1000);
    });
}

function upload_main(my_uid, downloader_uid, hash, size){
    global.log.info(my_uid);
    global.log.info(downloader_uid);
    global.log.info(hash);

    if (typeof(global.upload_clients) === "undefined") {
        global.upload_clients = {}; // 初始化, 记录client, 因为要用到client.is_available属性
    }

    utils.get_sourcefile_from_hash(global.res_hash_collection, hash, parseInt(size), main);

    function main(path, size) {
        fs.appendFileSync(mylog, 'sizetype: ' + typeof(size) + '\n');
        var totalparts = parseInt((size+partsize-1)/partsize);
        var totalblocks = parseInt((size+BLOCK_SIZE-1)/BLOCK_SIZE);

        var pool = 'u:' + my_uid.toString() + ':' + hash.toString() + ':' + downloader_uid.toString();
        fs.appendFileSync(mylog, "pool: " + pool);
        var client_id = pool + '-' + Date.now(); // 用pool+timestamp表示上传端的client,保证唯一性

        var interval_obj = setInterval(function () {
            if (global.upload_clients[client_id]) { // 有可能还是undefined, 所以要等到client存在
                if (global.upload_clients[client_id].is_available) {
                    clearInterval(interval_obj);
                    var socket = global.upload_clients[client_id].socket;
                    socket.removeAllListeners("message");
                    addEventListener(socket, path, totalparts, totalblocks, parseInt(size), client_id);
                    fs.appendFileSync(mylog, "uploader listening on " + socket.address().port+'\n');
                    fs.appendFileSync(mylog, "prepare to upload\n");
                }
            }
        }, 100); // 500ms is too long

        create_upload_client(global.nat_type, pool, client_id, interval_obj);
    }
}

exports.upload_main = upload_main;

