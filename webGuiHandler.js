//  Copyright (c) 2003-2020 Xsens Technologies B.V. or subsidiaries worldwide.
//  All rights reserved.
//  
//  Redistribution and use in source and binary forms, with or without modification,
//  are permitted provided that the following conditions are met:
//  
//  1.      Redistributions of source code must retain the above copyright notice,
//           this list of conditions, and the following disclaimer.
//  
//  2.      Redistributions in binary form must reproduce the above copyright notice,
//           this list of conditions, and the following disclaimer in the documentation
//           and/or other materials provided with the distribution.
//  
//  3.      Neither the names of the copyright holders nor the names of their contributors
//           may be used to endorse or promote products derived from this software without
//           specific prior written permission.
//  
//  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
//  EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
//  MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL
//  THE COPYRIGHT HOLDERS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
//  SPECIAL, EXEMPLARY OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT 
//  OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
//  HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY OR
//  TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
//  SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.THE LAWS OF THE NETHERLANDS 
//  SHALL BE EXCLUSIVELY APPLICABLE AND ANY DISPUTES SHALL BE FINALLY SETTLED UNDER THE RULES 
//  OF ARBITRATION OF THE INTERNATIONAL CHAMBER OF COMMERCE IN THE HAGUE BY ONE OR MORE 
//  ARBITRATORS APPOINTED IN ACCORDANCE WITH SAID RULES.
//  

// =======================================================================================
// Web GUI Handler
// Documentation: documentation/Xsens DOT Server - Web GUI Server.pdf
// =======================================================================================

// =======================================================================================
// Packages
// =======================================================================================
require('./global');
var fs = require('fs');

// =======================================================================================
// Constants
// =======================================================================================
const APP_DATA_DIR = 'data';

const STATIC_ASSETS_DIRECTORIES =
[
    '.',
    'images',
    'fonts',
    APP_DATA_DIR
];

const PORT = 8080;

// =======================================================================================
// Constructor
// =======================================================================================
class WebGuiHandler
{
    constructor(delegate) 
    {
        console.log( "Web GUI Handler instantiated" );

        this.delegate = delegate;
        this.express  = require('express');
        this.app      = this.express();
        this.http     = require('http').Server(this.app);
        this.io       = require('socket.io')(this.http);

        staticAssets(this, STATIC_ASSETS_DIRECTORIES);
        startWebserver(this);
        setHttpGetHandler(this);
        setWebsocketHandler(this);
    }

    sendGuiEvent( eventName, parameters )
    {
        this.io.emit( 'guiEvent', eventName, parameters );
    }
}

// =======================================================================================
// Local functions
// =======================================================================================

// ---------------------------------------------------------------------------------------
// -- Static assets --
// Make directories accessible.
// ----------------------------------------------------------------------------
function staticAssets( guiHandler, directories )
{
    directories.forEach( function( directory )
    {
        guiHandler.app.use(guiHandler.express.static( directory ));
    });
}
// ----------------------------------------------------------------------------
// -- Start webserver --
// ----------------------------------------------------------------------------
function startWebserver( guiHandler )
{
    guiHandler.http.listen(PORT, function ()
    {
        var ip = require("ip");
        console.log("Webserver listening on port " + PORT + ", IP address: " + ip.address() );
    });
}

// ----------------------------------------------------------------------------
// -- Websocket handler --
// ----------------------------------------------------------------------------
function setWebsocketHandler( guiHandler )
{
    guiHandler.io.on('connection', function( socket )
    {
         socket.on('guiEvent', function( eventName, parameters )
        {
            guiHandler.delegate.eventHandler( eventName, parameters );
        });

        socket.on('disconnect', function ()
        {
            console.log('Client disconnected');
        });

        socket.on('getConnectedSensors', function()
        {
            sendConnectedSensors(guiHandler);
        });

        socket.on('getFileList', function()
        {
            sendFileList(guiHandler);
        });

        socket.on('deleteFiles', function(files)
        {
            files.forEach( function (filename)
            {
                var path = process.cwd() + "/" + APP_DATA_DIR + "/" + filename;

                if (fs.existsSync( path ))
                {
                    fs.unlinkSync( path );
                }
            });
            
            setTimeout( function()
            {
                sendFileList(guiHandler);
            }, 100);
            
        });

    });
}

// ----------------------------------------------------------------------------
// -- Set HTTP get handler --
// ----------------------------------------------------------------------------
function setHttpGetHandler( guiHandler )
{
    guiHandler.app.get('/', function (req, res)
    {
        res.sendFile(process.cwd() + '/index.html' );
    });
}

// ----------------------------------------------------------------------------
// -- Send connected sensors --
// ----------------------------------------------------------------------------
function sendConnectedSensors( guiHandler )
{
    var connectedSensors = [];

    if (globalConnectedSensors != null && globalConnectedSensors != undefined) {
        globalConnectedSensors.forEach( function (sensor)
        {
            connectedSensors.push(sensor.address);
        });
    }

    guiHandler.io.emit('connectedSensors', connectedSensors );
};

// ----------------------------------------------------------------------------
// -- Send file list --
// ----------------------------------------------------------------------------
function sendFileList( guiHandler )
{
    fs.readdir( process.cwd() + "/" + APP_DATA_DIR, function (err, files)
    {
        guiHandler.io.emit('fileList', files );
    });
};

// =======================================================================================
// Export class
// =======================================================================================
module.exports = WebGuiHandler;
