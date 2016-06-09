// Copyright (c) 2016 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

'use strict';

var Buffer = require('buffer').Buffer;
var spawn = require('child_process').spawn;

module.exports = resolveSymbols;

// Shell out to OSX atos command
function resolveSymbols(pid, addresses, cb) {
    var args = ['-p', pid].concat(addresses);
    var atos = spawn('atos', args);

    var stdoutBuffers = [];
    var stderrBuffers = [];
    var stdoutLength = 0;
    var stderrLength = 0;

    atos.stdout.on('data', function onStdout(data) {
        stdoutBuffers.push(data);
        stdoutLength += data.length;
    });

    atos.stderr.on('data', function onStderr(data) {
        stdoutBuffers.push(data);
        stderrLength += data.length;
    });

    atos.on('close', function onClose(code) {
        if (stderrBuffers.length > 0) {
            console.log('feck');
            return cb(new Error('TODO: surface symbolication error'));
        }

        var symbols = Buffer.concat(stdoutBuffers, stdoutLength).toString().trim().split('\n');

        if (symbols.length !== addresses.length) {
            console.log(symbols, symbols.length, addresses.length);
            return cb(new Error('TODO: surface symbolication error'));
        }

        var index = {};

        for (var i = 0; i < addresses.length; i++) {
            index[addresses[i]] = symbols[i]
        }

        return cb(null, index);
    });  
}
