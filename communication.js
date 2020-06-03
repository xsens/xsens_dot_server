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
// Client side scripting for the Xsens DOT server.
// =======================================================================================

var socket = io();

var eventHandlerFunctions = {};
setEventHandlerFunctions();

var scanControlButton,
    connectionControlButton,
    measurementControlButton;

var selectedDiscoveredSensors  = [],
    discoveredSensors = [],
    connectedSensors = [],
    measuringSensors = [];

window.onload = function( eventName, parameters  )
{
    scanControlButton = document.getElementById("scanControlButton");

    connectionControlButton = document.getElementById("connectionControlButton");
    connectionControlButton.disabled = true;

    measurementControlButton = document.getElementById("measurementControlButton");
    measurementControlButton.disabled = true;

    getFileList();
}

function setEventHandlerFunctions()
{
    eventHandlerFunctions[ 'sensorDiscovered' ] = function( eventName, parameters  )
    {
        selectedDiscoveredSensors.push( parameters.address );
        addSensorToList( discoveredSensors, "DiscoveredSensors", parameters.address, discoveredSensorCheckboxClicked );
    };

    eventHandlerFunctions[ 'scanningStarted' ] = function( eventName, parameters  )
    {
        scanControlButton.innerHTML = 'Stop scanning';
        scanControlButton.disabled = false;
    };

    eventHandlerFunctions[  'scanningStopped' ] = function( eventName, parameters  )
    {
        scanControlButton.innerHTML = 'Start scanning';
        scanControlButton.disabled = false;
        disableCheckboxes( false );
        connectionControlButton.disabled = (selectedDiscoveredSensors.length == 0);                
    };

    eventHandlerFunctions[  'sensorConnected' ] = function( eventName, parameters  )
    {
        removeSensorFromList( discoveredSensors, "DiscoveredSensors", parameters.address );
        addSensorToList( connectedSensors, "ConnectedSensors", parameters.address );
    };

    eventHandlerFunctions[  'sensorDisconnected' ] = function( eventName, parameters  )
    {
        removeSensorFromList( connectedSensors, "ConnectedSensors", parameters.address );
        removeSensorFromList( measuringSensors, "MeasuringSensors", parameters.address );

        addSensorToList( discoveredSensors, "DiscoveredSensors", parameters.address, discoveredSensorCheckboxClicked );
    };

    eventHandlerFunctions[  'allSensorsDisconnected' ] = function( eventName, parameters  )
    {
        connectionControlButton.disabled = (selectedDiscoveredSensors.length == 0);
        connectionControlButton.innerHTML = "Connect sensors"
        scanControlButton.disabled = false;
        disableCheckboxes( false );
    };

    eventHandlerFunctions[  'allSensorsConnected' ] = function( eventName, parameters  )
    {
        connectionControlButton.disabled = (connectedSensors.length == 0);
        connectionControlButton.innerHTML = "Disconnect sensors"
        measurementControlButton.disabled = ( connectedSensors.length == 0 );
        disableCheckboxes( false );

    };

    eventHandlerFunctions[  'sensorEnabled' ] = function( eventName, parameters  )
    {
        addSensorToList( measuringSensors, "MeasuringSensors", parameters.address );
        removeSensorFromList( connectedSensors, "ConnectedSensors", parameters.address );
        recordingControlButton.disabled = false;
    };

    eventHandlerFunctions[  'allSensorsEnabled' ] = function( eventName, parameters  )
    {
        measurementControlButton.disabled = (measuringSensors.length == 0);
        measurementControlButton.innerHTML = "Disable sensors"
    };

    eventHandlerFunctions[  'sensorDisabled' ] = function( eventName, parameters  )
    {
        addSensorToList( connectedSensors, "ConnectedSensors", parameters.address );
        removeSensorFromList( measuringSensors, "MeasuringSensors", parameters.address );
    };

    eventHandlerFunctions[  'allSensorsDisabled' ] = function( eventName, parameters  )
    {
        measurementControlButton.disabled = ( connectedSensors.length == 0 );
        measurementControlButton.innerHTML = "Enable sensors";
        connectionControlButton.disabled = ( connectedSensors.length == 0 );
        recordingControlButton.disabled = true;
    };

    eventHandlerFunctions[ 'recordingStarted' ] = function( eventName, parameters  )
    {
        recordingControlButton.innerHTML = "Stop recording";
        recordingControlButton.disabled = false;
    };

    eventHandlerFunctions[ 'recordingStopped' ] = function( eventName, parameters  )
    {
        recordingControlButton.innerHTML = "Start recording";
        recordingControlButton.disabled = ( measuringSensors.length == 0);
        getFileList();
    };

    eventHandlerFunctions[  'sensorOrientation' ] = function( eventName, parameters  )
    {
    }

}

function guiEventHandler( eventName, parameters )
{
    if( eventHandlerFunctions[ eventName ] == undefined )
    {
        console.log( "WARNING: unhandled GUI event: " + eventName );
        return;
    }
    eventHandlerFunctions[ eventName ]( eventName, parameters );
}

function processFileList( files )
{
    if( files == undefined || files.length == 0 ) return;
    
    var recordings = document.getElementById("recordings");

    while( recordings.firstChild ) 
    {
        recordings.removeChild(recordings.firstChild);
    }
    
    files.forEach( function (file)
    {
        label = document.createElement("label");

        checkbox = document.createElement("input");
        checkbox.setAttribute( "type", "checkbox" );
        checkbox.setAttribute( "name", file );
        checkbox.setAttribute( "class", "file selection" );
        
        link = document.createElement("a");
        link.setAttribute( "href", "/"+file );
        link.setAttribute( "download", file );
        link.innerHTML = file;
        newLine = document.createElement( "br" );
        
        recordings.appendChild(label);
        label.appendChild(checkbox);
        label.appendChild(link);
        label.appendChild(newLine);
    });
}

function addSensorToList( sensorList, sensorListName, address, clickHandler )
{
    sensorList.push( address );

    var sensorListElement = document.getElementById(sensorListName);

    var label = document.createElement("label");
    label.setAttribute( "id", sensorListName+address );

    var sensorAddress = document.createTextNode(address);

    sensorListElement.appendChild(label);

    if( clickHandler )
    {
        var checkbox = document.createElement("input");
        checkbox.setAttribute( "type", "checkbox" );
        checkbox.setAttribute( "name",  address );
        checkbox.setAttribute( "class", sensorListName );
        checkbox.onclick = clickHandler;
        checkbox.checked = true;
        checkbox.disabled = true;
        label.appendChild(checkbox);
    }

    var newLine = document.createElement( "br" );
    label.appendChild(sensorAddress);
    label.appendChild(newLine);
}

function removeSensorFromList( sensorList, sensorListName, address )
{
    var idx = sensorList.indexOf( address );
    if( idx == -1 ) return;

    var element = document.getElementById(sensorListName+address);
    element.parentNode.removeChild(element);

    sensorList.splice(idx,1);
}

function sensorSelection( sensorList, name )
{
    var idx = sensorList.indexOf( name );
    if( idx == -1 )
    {
        sensorList.push( name );
    }
    else
    {
        sensorList.splice(idx,1);
    }
}

function disableCheckboxes( disabled )
{
    var elements = document.getElementsByClassName( "DiscoveredSensors" );
    for( var i=0; i<elements.length; i++ )
    {
        elements.item(i).disabled = disabled;
    }
}

function discoveredSensorCheckboxClicked()
{
    sensorSelection( selectedDiscoveredSensors, this.name );
    connectionControlButton.disabled = ( selectedDiscoveredSensors.length == 0 )
}

function scanControlButtonClicked()
{
    if( scanControlButton.innerHTML == 'Start scanning' )
    {
        sendGuiEvent( 'startScanning' );
        scanControlButton.innerHTML = 'Starting...';
        scanControlButton.disabled = true;
        connectionControlButton.disabled = true;

        while( discoveredSensors.length != 0 )
        {
            removeSensorFromList( discoveredSensors, "DiscoveredSensors", discoveredSensors[0] );
        }
        selectedDiscoveredSensors = [];
    }
    if( scanControlButton.innerHTML == 'Stop scanning' )
    {
        sendGuiEvent( 'stopScanning' );
        scanControlButton.innerHTML = 'Stopping...';
        scanControlButton.disabled = true;
    }
}

function connectionControlButtonClicked()
{
    if( connectionControlButton.innerHTML == 'Connect sensors' )
    {
        sendGuiEvent( 'connectSensors', {addresses:selectedDiscoveredSensors} );
        connectionControlButton.innerHTML = "Stop connecting"
        scanControlButton.disabled = true;
        disableCheckboxes( true );
    }
    else if( connectionControlButton.innerHTML == 'Stop connecting' )
    {
        sendGuiEvent( 'stopConnectingSensors' );
        connectionControlButton.disabled = true;
        scanControlButton.disabled = true;
    }
    else
    {
        sendGuiEvent( 'disconnectSensors', {addresses:connectedSensors} );
        connectionControlButton.disabled = true;
        connectionControlButton.innerHTML = "Disconnecting..."
        measurementControlButton.disabled = true;
        scanControlButton.disabled = true;
    }
}

function measurementControlButtonClicked()
{
    if( measurementControlButton.innerHTML == 'Enable sensors')
    {
        sendGuiEvent( 'startMeasuring', {addresses:connectedSensors} );
        connectionControlButton.disabled  = true;
        measurementControlButton.disabled = true;
        scanControlButton.disabled = true;
        measurementControlButton.innerHTML = "Enabling..."
    }
    else
    {
        sendGuiEvent( 'stopMeasuring', {addresses:measuringSensors} );
        measurementControlButton.disabled = true;
        measurementControlButton.innerHTML = "Disabling..."
    }
}

function recordingControlButtonClick()
{
    if( recordingControlButton.innerHTML == 'Start recording' )
    {
        recordingControlButton.innerHTML = "Starting recording...";
        recordingControlButton.disabled = true;
        sendGuiEvent( 'startRecording', {filename:getUniqueFilename()} );
    }
    else
    {
        recordingControlButton.innerHTML = "Stopping recording...";
        recordingControlButton.disabled = true;
        sendGuiEvent( 'stopRecording' );
    }
}

function deleteFilesButtonClick()
{
    // Get all selected 
    var selectedFiles = [];
    
    checkboxes = document.getElementsByClassName( "file selection" );
    
    for( i=0; i<checkboxes.length; i++ )
    {
        if( checkboxes[i].checked )
        {
            selectedFiles.push( checkboxes[i].getAttribute("name") );
        }
    }

    if( selectedFiles.length == 0 ) return;

    deleteFiles( selectedFiles );
}



// ---------------------------------------------------------------------------------------
// -- Handle 'guiEvent' --
// ---------------------------------------------------------------------------------------
socket.on( 'guiEvent', function( eventName, parameters )
{
    if( typeof guiEventHandler === 'undefined' )
    {
        console.log( "WARNING 'guiEventHandler()' function not defined on page!" )
    }
    else guiEventHandler( eventName, parameters );
});

// ---------------------------------------------------------------------------------------
// -- Emit 'guiEvent' with event name and parameters --
// ---------------------------------------------------------------------------------------
function sendGuiEvent( eventName, parameters )
{
    socket.emit( 'guiEvent', eventName, parameters );
}

// ---------------------------------------------------------------------------------------
// -- Get file list --
// ---------------------------------------------------------------------------------------
function getFileList()
{
    socket.emit( 'getFileList' );
}

// ---------------------------------------------------------------------------------------
// -- Delete files --
// ---------------------------------------------------------------------------------------
function deleteFiles( files )
{
    socket.emit( 'deleteFiles', files );
}

// ---------------------------------------------------------------------------------------
// -- Handle 'fileList' --
// ---------------------------------------------------------------------------------------
socket.on( 'fileList', function( files )
{
    if( typeof processFileList === 'undefined' )
    {
        console.log( "WARNING 'processFileList()' function not defined on page!" )
    }
    else processFileList( files );
});

// ---------------------------------------------------------------------------------------
// -- Get a unique filename --
// ---------------------------------------------------------------------------------------
function getUniqueFilename()
{                    
    var date    = new Date();
    var year    = (date.getFullYear()).toString();
    var month   = (date.getMonth()+1).toString();
    var day     = (date.getDate()).toString();
    var hours   = (date.getHours()).toString();
    var minutes = (date.getMinutes()).toString();
    var seconds = (date.getSeconds()).toString();

    return 	year + "-" +
            month.padStart(2,"0") + "-" +
            day.padStart(2,"0") + "-" +
            hours.padStart(2,"0") + "-" +
            minutes.padStart(2,"0") + "-" +
            seconds.padStart(2,"0");		
}


