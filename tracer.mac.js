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

var HeapReader = require('./lib/heap-reader.js');

module.exports = OSXTracer;

function OSXTracer(pid) {
    this.pid = pid;
    this.port = 0;
    this.memReader = null;
    this.heapReader = null;
}

OSXTracer.prototype.attach = attachOSXTracer;
OSXTracer.prototype.backtrace = takeOSXBacktrace;
OSXTracer.prototype.detach = detachOSXTracer;

function attachOSXTracer() {
    var self = this;
    var pid = self.pid;
    var port = self.port = tracer.taskPort(pid);

    if (port === -1) {
        return false;
    }

    var memReader = self.memReader = new MacMemoryReader(port);
    self.heapReader = new HeapReader(memReader);

    return true;
}

function takeOSXBacktrace() {
    var self = this;
    var port = self.port;
    var heapReader = self.heapReader;
    var backtrace = tracer.backtrace(port);

    //return backtrace;

    var frameCount = backtrace[0];
    var annotatedBacktrace = [];

    // Error reading the frame
    if (frameCount < 0) {
        self.port = tracer.taskPort(self.pid);
        tracer.resume(port);
        return null;
    } else {

    }

    for (var i = 0; i < frameCount; i++) {
        var pc = backtrace[2 * i + 1];
        var frame = backtrace[2 * i + 2];

        var frameAnnotation = heapReader.readStackFrameAnnotation(pc, frame);

        if (frameAnnotation) {
            annotatedBacktrace.push(frameAnnotation);
        } else {
            annotatedBacktrace.push(frame);
        }
    }

    tracer.resume(port);

    return annotatedBacktrace;
}

function detachOSXTracer() {
    var self = this;
    // TODO: figure out how to close the task port?
    tracer.resume(self.port);
    self.port = 0;
    self.memReader = null;
    self.heapReader = null;

    return true;
}

function MacMemoryReader(port) {
    this.port = port;
}

MacMemoryReader.prototype.readUInt8 = readUInt8;
MacMemoryReader.prototype.readUInt16 = readUInt16;
MacMemoryReader.prototype.readUInt32 = readUInt32;
MacMemoryReader.prototype.readUInt64 = readUInt64;

function readUInt8(addr) {
    var port = this.port;
    return tracer.readUInt8(port, addr);
}

function readUInt16(addr) {
    var port = this.port;
    return tracer.readUInt16(port, addr);
}

function readUInt32(addr) {
    var port = this.port;
    return tracer.readUInt32(port, addr);
}

function readUInt64(addr) {
    var port = this.port;
    return tracer.readUInt64(port, addr);
}
