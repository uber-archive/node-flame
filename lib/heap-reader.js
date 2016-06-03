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
var fs = require('fs');

var STRING_LENGTH_OFFSET = 0x08;
var SEQ_STRING_DATA_OFFSET = 0x18;
var CONS_STRING_FIRST_OFFSET = 0x18;
var CONS_STRING_SECOND_OFFSET = 0x20;
var MAX_CONS_STRING_DEPTH = 5;

var ARGUMENTS_ADAPTOR_CONTEXT_VAL = 0x04;

var STRING_REPR_MASK = 0x07;
var STRING_ENC_ASCII = 0x04;
var STRING_LAYOUT_MASK = 0x03;
var STRING_LAYOUT_SEQ = 0x00;
var STRING_LAYOUT_CONS = 0x01;

var HEAP_OBJECT_MAP_OFFSET = 0x00;
var HEAP_MAP_TYPE_OFFSET = 0x0c;

var HEAP_OBJECT_FIXED_ARRAY_TYPE = 0xa3;

var JS_FUNC_SHARED_INFO_OFFSET = 0x28;

var SHARED_INFO_NAME_OFFSET = 0x08;
var SHARED_INFO_INFERRED_NAME_OFFSET = 0x50;
var SHARED_INFO_SCRIPT_OFFSET = 0x40;
var SHARED_INFO_START_POSITION_AND_TYPE_OFFSET = 0x84;
var SHARED_INFO_START_POSITION_SHIFT = 0x02;

var SCRIPT_NAME_OFFSET = 0x10;
var SCRIPT_LINE_OFFSET_OFFSET = 0x18;
var SCRIPT_LINE_ENDS_OFFSET = 0x58;

var FIXED_ARRAY_LENGTH_OFFSET = 0x08;
var FIXED_ARRAY_HEADER_SIZE = 0x10;

var FRAME_TYPE_NONE = 0;
var FRAME_TYPE_ENTRY = 1;
var FRAME_TYPE_ENTRY_CONSTRUCT = 2;
var FRAME_TYPE_EXIT = 3;
var FRAME_TYPE_JAVA_SCRIPT = 4;
var FRAME_TYPE_OPTIMIZED = 5;
var FRAME_TYPE_INTERNAL = 6;
var FRAME_TYPE_CONSTRUCT = 7;
var FRAME_TYPE_ARGUMENTS_ADAPTOR = 8;
var FRAME_TYPE_NATIVE = -1;

var FP_CONTEXT_OFFSET = -0x08;
var FP_FUNC_OFFSET = -0x10;
var FP_RECEIVER_OFFSET = 0x10;

var HEAP_OBJECT_FIXED_ARRAY_TYPE = 0xa3;
var HEAP_OBJECT_BUILTIN_TYPE = 0xae;
var HEAP_OBJECT_JS_FUNCTION_TYPE = 0xb5;
var HEAP_OBJECT_CODE_TYPE = 0x81;

var JS_FUNC_CONTEXT_OFFSET = 0x30;
var CONTEXT_HEADER_SIZE = 0x10;
var CONTEXT_GLOBAL_OBJECT_INDEX = 0x03;

module.exports = HeapReader;

function HeapReader(fd) {
    this.fd = fd;
    this.buffer = new Buffer(8);
}

HeapReader.prototype.readUInt8 = readUInt8;
HeapReader.prototype.readUInt16 = readUInt16;
HeapReader.prototype.readUInt32 = readUInt32;
HeapReader.prototype.readUInt64 = readUInt64;
HeapReader.prototype.readSMI = readSMI;
HeapReader.prototype.readPointer = readPointer;
HeapReader.prototype.readStringLength = readStringLength;
HeapReader.prototype.readStringShape = readStringShape;
HeapReader.prototype.readAsciiString = readAsciiString;
HeapReader.prototype.readUtf16String = readUtf16String;
HeapReader.prototype.readConsString = readConsString;
HeapReader.prototype.readString = readString;
HeapReader.prototype.readStringInternal = readStringInternal;
HeapReader.prototype.readHeapObjectType = readHeapObjectType;
HeapReader.prototype.readFixedArrayLength = readFixedArrayLength;
HeapReader.prototype.readFixedArraySMI = readFixedArraySMI;
HeapReader.prototype.readFuncSharedInfo = readFuncSharedInfo;
HeapReader.prototype.readFuncSharedInfoName = readFuncSharedInfoName;
HeapReader.prototype.readFuncSharedInfoFileName = readFuncSharedInfoFileName;
HeapReader.prototype.readFuncSharedInfoLineNumber =
    readFuncSharedInfoLineNumber;
HeapReader.prototype.readJSFunction = readJSFunction;
HeapReader.prototype.readFromJSContext = readFromJSContext;
HeapReader.prototype.readFrameIsJSBuiltin = readFrameIsJSBuiltin;
HeapReader.prototype.readFuncIsHiddenBuiltin = readFuncIsHiddenBuiltin;
HeapReader.prototype.readFrameType = readFrameType;
HeapReader.prototype.readStackFrameAnnotation = readStackFrameAnnotation;

function readUInt8(addr) {
    var self = this;

    var fd = self.fd;
    var buffer = self.buffer;

    buffer.fill(0);
    fs.readSync(fd, buffer, 0, 1, addr);

    return buffer.readUInt8(0);
}

function readUInt16(addr) {
    var self = this;

    var fd = self.fd;
    var buffer = self.buffer;

    buffer.fill(0);
    fs.readSync(fd, buffer, 0, 2, addr);

    return buffer.readUInt16LE(0);
}

function readUInt32(addr) {
    var self = this;

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

function stripLowBit(addr) {
    return addr - (addr % 2);
}

function isSMI(addr) {
    return addr % 2 === 0;
}

function smiValue(val) {
    return Math.floor(val / Math.pow(2, 32));
}

function readSMI(addr) {
    var val = this.readUInt64(addr);
    return smiValue(val);
}

function readPointer(addr) {
    return stripLowBit(this.readUInt64(stripLowBit(addr)));
}

function readStringShape(stringAddr) {
    var self = this;

    var mapPtr = self.readPointer(stringAddr + HEAP_OBJECT_MAP_OFFSET);
    var typeField = self.readUInt8(mapPtr + HEAP_MAP_TYPE_OFFSET);

    return typeField & STRING_REPR_MASK;
}

function readStringLength(stringAddr) {
    return this.readSMI(stringAddr + STRING_LENGTH_OFFSET);
}

function readAsciiString(addr, length) {
    var self = this;

    addr = stripLowBit(addr);
    var str = [];

    for (var i = 0; i < length; i++) {
        var char = self.readUInt8(addr);
        str.push(String.fromCharCode(char));
        addr += 1;
    }

    return str.join('');
}

function readUtf16String(addr, length) {
    var self = this;

    addr = stripLowBit(addr);
    var str = [];

    for (var i = 0; i < 200 && i < length; i++) {
        var char = self.readUInt16(addr);
        str.push(String.fromCharCode(char));
        addr += 2;
    }

    return str.join('');
}

function readConsString(stringPtr, depth) {
    var self = this;

    var first = self.readPointer(stringPtr + CONS_STRING_FIRST_OFFSET);
    var second = self.readPointer(stringPtr + CONS_STRING_SECOND_OFFSET);
    var firstString = self.readStringInternal(first, depth + 1);
    var secondString = self.readStringInternal(second, depth + 1);

    return firstString + secondString;
}

function readStringInternal(origStringAddr, depth) {
    var self = this;

    if (depth >= MAX_CONS_STRING_DEPTH) {
        return '...';
    }

    var stringAddr = stripLowBit(origStringAddr);
    var stringShape = self.readStringShape(stringAddr);
    var stringLength = self.readStringLength(stringAddr);

    if (stringLength === 0) {
        return '';
    } else if (stringShape === (STRING_ENC_ASCII | STRING_LAYOUT_SEQ)) {
        return self.readAsciiString(
            stringAddr + SEQ_STRING_DATA_OFFSET,
            stringLength
        );
    } else if (stringShape === (STRING_LAYOUT_SEQ)) {
        return self.readUtf16String(
            stringAddr + SEQ_STRING_DATA_OFFSET,
            stringLength
        );
    } else if ((stringShape & STRING_LAYOUT_MASK) === STRING_LAYOUT_CONS) {
        return self.readConsString(stringAddr, depth + 1);
    } else {
        return '[unknown]';
    }
}

function readString(stringAddr) {
    return this.readStringInternal(stringAddr, 0);
}

function readFuncSharedInfo(funcPtr) {
    return this.readPointer(funcPtr + JS_FUNC_SHARED_INFO_OFFSET);
}

function readFuncSharedInfoName(sharedInfoPtr) {
    var self = this;

    var ptr = self.readPointer(sharedInfoPtr + SHARED_INFO_NAME_OFFSET);
    var stringLength = self.readStringLength(ptr);

    if (stringLength === 0) {
        ptr = self.readPointer(
            sharedInfoPtr + SHARED_INFO_INFERRED_NAME_OFFSET
        );
    }

    return self.readString(ptr);
}

function readFuncSharedInfoFileName(sharedInfoPtr) {
    var self = this;

    var scriptPtr = this.readPointer(sharedInfoPtr + SHARED_INFO_SCRIPT_OFFSET);
    var scriptNamePtr = this.readPointer(scriptPtr + SCRIPT_NAME_OFFSET);

    return self.readString(scriptNamePtr);
}

function readHeapObjectType(objPtr) {
    var self = this;
    var mapPtr = self.readPointer(objPtr + HEAP_OBJECT_MAP_OFFSET);

    return self.readUInt8(mapPtr + HEAP_MAP_TYPE_OFFSET);
}

function readFixedArrayLength(arrayAddr) {
    return this.readSMI(arrayAddr + FIXED_ARRAY_LENGTH_OFFSET);
}

function readFixedArraySMI(arrayAddr, index) {
    return this.readSMI(arrayAddr + FIXED_ARRAY_HEADER_SIZE + 8 * index);
}

function readFuncSharedInfoLineNumber(sharedInfoPtr) {
    var self = this;

    var startPosition = Math.floor(
        self.readUInt32(
            sharedInfoPtr + SHARED_INFO_START_POSITION_AND_TYPE_OFFSET
        ) / Math.pow(2, SHARED_INFO_START_POSITION_SHIFT)
    );

    var scriptPtr = self.readPointer(sharedInfoPtr + SHARED_INFO_SCRIPT_OFFSET);
    var lineEnds = self.readPointer(scriptPtr + SCRIPT_LINE_ENDS_OFFSET);
    var lineOffset = self.readSMI(scriptPtr + SCRIPT_LINE_OFFSET_OFFSET);
    var size = self.readFixedArrayLength(lineEnds);

    if (self.readHeapObjectType(lineEnds) !== HEAP_OBJECT_FIXED_ARRAY_TYPE) {
        return '[unknown]';
    }

    var low = 0;
    var high = size - 1;

    while (low < high) {
        var mid = Math.floor((high + low) / 2);

        var midLineEnd = self.readFixedArraySMI(lineEnds, mid);

        if (midLineEnd < startPosition) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }

    var lineNumber = low + lineOffset;

    if (lineNumber >= 0) {
        return lineNumber;
    } else {
        return '[unknown]';
    }
}

function readFrameIsJSBuiltin(framePointer) {
    var self = this;

    try {
        var receiver = self.readPointer(framePointer + FP_RECEIVER_OFFSET);
        var receiverType = self.readHeapObjectType(receiver);
        return receiverType === HEAP_OBJECT_BUILTIN_TYPE;
    } catch(e) {
        return false;
    }
}

function readFuncIsHiddenBuiltin(funcPointer) {
    var self = this;

    try {
        var context = self.readPointer(funcPointer + JS_FUNC_CONTEXT_OFFSET);
        var globalObject = self.readContex(context, CONTEXT_GLOBAL_OBJECT_INDEX);
        var objType = self.readHeapObjectType(globalObject);
        return objType === HEAP_OBJECT_BUILTIN_TYPE;
    } catch(e) {
        return false;
    }
}

function readFrameType(framePointer) {
    var self = this;
    framePointer = stripLowBit(framePointer);

    var contextVal = self.readUInt64(framePointer + FP_CONTEXT_OFFSET);
    if (isSMI(contextVal) &&
        smiValue(contextVal) === ARGUMENTS_ADAPTOR_CONTEXT_VAL
    ) {
        return FRAME_TYPE_ARGUMENTS_ADAPTOR;
    }

    var funcPtr = self.readUInt64(framePointer + FP_FUNC_OFFSET);
    if (isSMI(funcPtr)) {
        return smiValue(funcPtr);
    }

    var typeField;

    try {
        typeField = self.readHeapObjectType(funcPtr);
    } catch (e) {
        typeField = 0;
    }

    if (typeField !== HEAP_OBJECT_JS_FUNCTION_TYPE) {
        if (typeField === HEAP_OBJECT_CODE_TYPE) {
            return FRAME_TYPE_INTERNAL;
        }
        return FRAME_TYPE_NATIVE;
    }

    return FRAME_TYPE_JAVA_SCRIPT;
}

function readFromJSContext(ctx, idx) {
    return this.readPointer(ctx + CONTEXT_HEADER_SIZE + idx * 0x8);
}

function readJSFunction(funcPointer) {
    var self = this;

    var sharedInfoPtr;
    var functionName;
    var fileName;
    var lineNumber;

    try {
        sharedInfoPtr = self.readFuncSharedInfo(funcPointer);
    } catch (e) {
        return '[empty]:[empty]:[unknown]';
    }

    try {
        functionName = self.readFuncSharedInfoName(sharedInfoPtr);
    } catch (e) {
        functionName = '[empty]';
    }

    try {
        fileName = self.readFuncSharedInfoFileName(sharedInfoPtr);
    } catch (e) {
        fileName = '[empty]';
    }

    try {
        lineNumber = self.readFuncSharedInfoLineNumber(sharedInfoPtr);
    } catch (e) {
        lineNumber = '[unknown]';
    }

    return (functionName || '[empty]') + ':' +
        (fileName || '[empty]') + ':' + lineNumber;
}

function annotateNonJSFrame(pc, frameType) {
    if (frameType === FRAME_TYPE_NATIVE || frameType === FRAME_TYPE_NONE) {
        return '[native:' + pc.toString(16) + ']';
    } else if (frameType === FRAME_TYPE_ENTRY) {
        return '[entry frame]';
    } else if (frameType === FRAME_TYPE_ENTRY_CONSTRUCT) {
        return '[constructor entry]';
    } else if (frameType === FRAME_TYPE_CONSTRUCT) {
        return '[constructor frame]';
    } else if (frameType === FRAME_TYPE_ARGUMENTS_ADAPTOR) {
        return '[arguments adaptor]';
    } else if (frameType === FRAME_TYPE_EXIT) {
        return '[exit frame]';
    } else if (frameType === FRAME_TYPE_INTERNAL) {
        return '[internal frame]';
    } else {
        return '[native:' + pc.toString(16) + ']';
    }
}

function readStackFrameAnnotation(pc, framePointer) {
    var self = this;

    var frameType;

    try {
        frameType = self.readFrameType(framePointer);
    } catch(e) {
        return '[Unknown: ' + framePointer.toString(16) + ']';
    }

    if (frameType === FRAME_TYPE_JAVA_SCRIPT) {
        var funcPointer;

        try {
            funcPointer = self.readPointer(framePointer + FP_FUNC_OFFSET);
        } catch (e) {
            return '[Unknown: ' + framePointer.toString(16) + ']';
        }

        if (self.readFrameIsJSBuiltin(framePointer) ||
            self.readFuncIsHiddenBuiltin(funcPointer)
        ) {
            return '[Builtin: ' + framePointer.toString('16') + ']';
        }

        return self.readJSFunction(funcPointer);
    }

    return annotateNonJSFrame(pc, frameType);
}
