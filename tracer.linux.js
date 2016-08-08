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

var tracer = require('bindings')('node_backtrace');

var Buffer = require('buffer').Buffer;
var fs = require('fs');

var HeapReader = require('./lib/heap-reader.js');

module.exports = LinuxTracer;

function LinuxTracer(pid) {
    this.pid = pid;
    this.memReader = null;
    this.heapReader = null;
}

LinuxTracer.prototype.attach = attachLinuxTracer;
LinuxTracer.prototype.backtrace = takeLinuxBacktrace;
LinuxTracer.prototype.detach = detachLinuxTracer;

function attachLinuxTracer() {
    var self = this;
    var result = tracer.attach(this.pid);

    if (result) {
        var memReader = self.memReader = new LinuxMemoryReader(self.pid);
        memReader.init();
        self.heapReader = new HeapReader(memReader);
    }

    return result;
}

function takeLinuxBacktrace() {
    var self = this;
    var pid = self.pid;
    var heapReader = self.heapReader;
    var backtrace = tracer.backtrace(pid);

    var frameCount = backtrace[0];
    var annotatedBacktrace = [];

    // Error reading the frame
    if (frameCount < 0) {
        tracer.resume(pid);
        return null;
    }

    for (var i = 0; i < frameCount; i++) {
        var pc = backtrace[2 * i + 1];
        var frame = backtrace[2 * i + 2];
        var frameAnnotation = heapReader.readStackFrameAnnotation(pc, frame);

        if (frameAnnotation) {
            annotatedBacktrace.push(frameAnnotation);
        }
    }

    tracer.resume(pid);

    return annotatedBacktrace;
}

function detachLinuxTracer() {
    var self = this;
    var memReader = self.memReader;
    self.heapReader = null;

    tracer.detach(self.pid);

    if (memReader) {
        memReader.destroy();
        self.memReader = null;
    }

    return true;
}

function LinuxMemoryReader(pid) {
    var self = this;
    self.pid = pid;
    self.buffer = new Buffer(4);
    self.fd = null;
}

LinuxMemoryReader.prototype.init = initLinuxMemoryReader;
LinuxMemoryReader.prototype.destroy = destroyLinuxMemoryReader;
LinuxMemoryReader.prototype.readUInt8 = readUInt8;
LinuxMemoryReader.prototype.readUInt16 = readUInt16;
LinuxMemoryReader.prototype.readUInt32 = readUInt32;
LinuxMemoryReader.prototype.readUInt64 = readUInt64;

function initLinuxMemoryReader() {
    var self = this;
    var pid = self.pid;
    self.fd = fs.openSync('/proc/' + pid + '/mem', 'r');
}

function destroyLinuxMemoryReader() {
    var self = this;
    fs.close(self.fd);
    self.fd = null;
}

function readUInt8(addr) {
    var self = this;

    if (addr === 0) {
        return 0;
    }

    var fd = self.fd;
    var buffer = self.buffer;

    buffer.fill(0);
    fs.readSync(fd, buffer, 0, 1, addr);

    return buffer.readUInt8(0);
}

function readUInt16(addr) {
    var self = this;

    if (addr === 0) {
        return 0;
    }

    var fd = self.fd;
    var buffer = self.buffer;

    buffer.fill(0);
    fs.readSync(fd, buffer, 0, 2, addr);

    return buffer.readUInt16LE(0);
}

function readUInt32(addr) {
    var self = this;

    if (addr === 0) {
        return 0;
    }

    var fd = self.fd;
    var buffer = self.buffer;
    buffer.fill(0);

    fs.readSync(fd, buffer, 0, 4, addr);

    return buffer.readUInt32LE(0);
}

function readUInt64(addr) {
    var self = this;

    if (addr === 0) {
        return 0;
    }

    var fd = self.fd;
    var buffer = self.buffer;

    buffer.fill(0);
    fs.readSync(fd, buffer, 0, 8, addr);

    var a = buffer.readUInt32LE(0);
    var b = buffer.readUInt32LE(4);

    return a + b * 0x100000000;
}
