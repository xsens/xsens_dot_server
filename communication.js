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
    measurementControlButton,
    stopMeasuringButton,
    measurementPayloadList,
    syncingModal,
    measurementMode,
    headingResetTip,
    headingResetButton,
    syncControlButton;

var discoveredSensors = [],
    connectedSensors  = [],
    measuringSensors  = [];

var lastHeadingStatusList = [];

var scanningTimeoutId;

var measuringPayloadId = -1;

var lastSensorsDataTimeMap = [];
var lastSensorDataTime     = 0;

var isSyncingEnabled = true;

const MEASURING_PAYLOAD_TYPE_COMPLETE_EULER           = '16';
const MEASURING_PAYLOAD_TYPE_EXTENDED_QUATERNION      = '2';
const MEASURING_PAYLOAD_TYPE_RATE_QUANTITIES_WITH_MAG = '20';
const MEASURING_PAYLOAD_TYPE_CUSTOM_MODE_1            = '22';
const MEASURING_PAYLOAD_TYPE_CUSTOM_MODE_2            = '23';
const MEASURING_PAYLOAD_TYPE_CUSTOM_MODE_3            = '24';

const ID_LOGO_IMAGE                = "logoImage";
const ID_CONNECTION_CONTROL_BUTTON = "connectionControlButton";
const ID_SENSOR_DATA_INDICATOR     = "sensorDataIndicator";

const TEXT_CONNECT    = "Connect";
const TEXT_DISCONNECT = "Disconnect";

const HEADING_STATUS_XRM_HEADING = 1;

window.onload = function( eventName, parameters  )
{
    scanControlButton = document.getElementById("scanControlButton");

    measurementControlButton = document.getElementById("measurementControlButton");
    measurementControlButton.disabled = true;
    measurementControlButton.hidden = true;

    stopMeasuringButton = document.getElementById("stopMeasuringButton");
    stopMeasuringButton.hidden = true;

    measurementPayloadList = document.getElementById("measurementPayloadList");

    syncingModal = document.querySelector(".modal");

    measurementMode = document.getElementById("measurementMode");
    headingResetTip = document.getElementById("headingResetTip");
    headingResetButton = document.getElementById("headingResetButton");

    syncControlButton = document.getElementById("syncControlButton");
    syncControlButton.hidden = measurementControlButton.hidden;

    getConnectedSensors();

    getFileList();
}

window.onunload = function( eventName, parameters  )
{
    stopScanning();
}

function setEventHandlerFunctions()
{
    eventHandlerFunctions[ 'sensorDiscovered' ] = function( eventName, parameters  )
    {
        addSensorToList( discoveredSensors, "DiscoveredSensors", parameters.address );
    };

    eventHandlerFunctions[ 'scanningStarted' ] = function( eventName, parameters  )
    {
        scanControlButton.innerHTML = 'Stop Scanning';
        scanControlButton.disabled = false;
    };

    eventHandlerFunctions[  'scanningStopped' ] = function( eventName, parameters  )
    {
        scanControlButton.innerHTML = 'Start Scanning';
        scanControlButton.disabled = false;
    };

    eventHandlerFunctions[  'sensorConnected' ] = function( eventName, parameters  )
    {
        console.log("sensorConnected " + parameters.address);

        connectedSensors.push( parameters.address );

        var logoImage = document.getElementById(ID_LOGO_IMAGE + parameters.address);
        if (logoImage != null)
        {
            logoImage.src = "Xsens_DOT_connected.png";
        }

        var element = document.getElementById(ID_CONNECTION_CONTROL_BUTTON + parameters.address);
        if (element != null)
        {
            element.innerHTML = TEXT_DISCONNECT;
            element.disabled = false;
            element.style.color = "#FFFFFF";
            element.style.background = "#EA6852";
            element.onmouseover = onButtonMouseOver;
            element.onmouseout = onButtonMouseOver;
        }

        enableOrDisableMeasurementControlButton();

    };

    eventHandlerFunctions[  'sensorDisconnected' ] = function( eventName, parameters  )
    {
        console.log("sensorDisconnected " + parameters.address);

        removeSensor( measuringSensors, parameters.address );
        
        var logoImage = document.getElementById(ID_LOGO_IMAGE + parameters.address);
        if (logoImage != null)
        {
            logoImage.src = "Xsens_DOT_disconnected.png";
        }

        var element = document.getElementById(ID_CONNECTION_CONTROL_BUTTON + parameters.address);
        if (element != null)
        {
            element.innerHTML = TEXT_CONNECT;
            element.disabled = false;
            element.style.color = "#EA6852";
            element.style.background = "#FFFFFF";
            element.onmouseover = onButtonMouseOver;
            element.onmouseout = onButtonMouseOut;
        }
        

        var idx = connectedSensors.indexOf( parameters.address );
        if( idx == -1 ) return;
    
        connectedSensors.splice(idx, 1);

        console.log("sensorDisconnected " + connectedSensors.length);

        enableOrDisableMeasurementControlButton();

        removeLastHeadingStatus(parameters.address);
    };

    eventHandlerFunctions[  'sensorEnabled' ] = function( eventName, parameters  )
    {
        measuringSensors.push( parameters.address );

        console.log("sensorEnabled " + parameters.address + ", " + measuringSensors.length);

        measurementControlButton.disabled = (measuringSensors.length == 0);
        measurementControlButton.hidden = true;

        syncControlButton.hidden = measurementControlButton.hidden;

        stopMeasuringButton.innerHTML = "Stop Logging";
        stopMeasuringButton.disabled = false;
        stopMeasuringButton.hidden = false;
        
        if (measuringSensors.length == 1)
        {
            sendGuiEvent( 'startRecording', {filename:getUniqueFilename()} );
        }

        enableOrDisableConnectButtons(true);

        // Show current measurement mode
        var modeStr = "";
        var isHiddenHeadingResetTip = true;
        switch (measuringPayloadId)
        {
            case MEASURING_PAYLOAD_TYPE_COMPLETE_EULER:
                modeStr = "Measurement Mode: Complete (Euler)";
                break;

            case MEASURING_PAYLOAD_TYPE_EXTENDED_QUATERNION:
                modeStr = "Measurement Mode: Extended (Quaternion)";
                break;

            case MEASURING_PAYLOAD_TYPE_RATE_QUANTITIES_WITH_MAG:
                modeStr = "Measurement Mode: Rate quantities (with mag)";
                isHiddenHeadingResetTip = false;
                break;

            case MEASURING_PAYLOAD_TYPE_CUSTOM_MODE_1:
                modeStr = "Measurement Mode: Custom Mode 1";
                break;

            case MEASURING_PAYLOAD_TYPE_CUSTOM_MODE_2:
                modeStr = "Measurement Mode: Custom Mode 2";
                break;

            case MEASURING_PAYLOAD_TYPE_CUSTOM_MODE_3:
                modeStr = "Measurement Mode: Custom Mode 3";
                break;
        }
        measurementMode.innerHTML = modeStr;
        measurementMode.hidden = false;

        headingResetTip.hidden = isHiddenHeadingResetTip;
        headingResetButton.hidden = !isHiddenHeadingResetTip;
    };

    eventHandlerFunctions[  'allSensorsEnabled' ] = function( eventName, parameters  )
    {
    };

    eventHandlerFunctions[  'sensorDisabled' ] = function( eventName, parameters  )
    {
        removeSensor( measuringSensors, parameters.address );

        console.log("sensorDisabled "+ parameters.address + ", " + measuringSensors.length);

        var  allSensorsDisabled = measuringSensors.length == 0;

        if (connectedSensors.length > 0)
        {
            measurementControlButton.disabled = !allSensorsDisabled;
            measurementControlButton.hidden = !allSensorsDisabled;

            syncControlButton.hidden = measurementControlButton.hidden;
        }

        if (allSensorsDisabled)
        {
            scanControlButton.disabled = false;
            stopMeasuringButton.innerHTML = "Stop logging";
            measurementPayloadList.style.display = '';

            headingResetTip.hidden = allSensorsDisabled;
            headingResetButton.hidden = allSensorsDisabled;
        }

        stopMeasuringButton.hidden = allSensorsDisabled;
        measurementMode.hidden = allSensorsDisabled;

        enableOrDisableConnectButtons(false);
        getFileList();
    };

    eventHandlerFunctions[  'allSensorsDisabled' ] = function( eventName, parameters  )
    {
    };

    eventHandlerFunctions[ 'recordingStopped' ] = function( eventName, parameters  )
    {
    };

    eventHandlerFunctions[  'sensorOrientation' ] = function( eventName, parameters  )
    {
        const address = parameters.address;
        var now = Date.parse(new Date());

        lastSensorsDataTimeMap[address] = now;

        const diff = now - lastSensorDataTime;

        if (lastSensorDataTime == 0 || diff >= 2000)
        {
            lastSensorDataTime = now;

            measuringSensors.forEach( function (address)
            {
                var element = document.getElementById(ID_SENSOR_DATA_INDICATOR + address);
                if (element != null)
                {
                    var lastDataTime = lastSensorsDataTimeMap[address];
                
                    if (lastDataTime != null && lastDataTime != undefined)
                    {
                        const diff = now - lastDataTime;

                        if (diff >= 2000)
                        {
                            element.style.color = "#6A6A6A";
                        }
                        else
                        {
                            element.style.color = "#EA6852";
                        }
                    }
                    else
                    {
                        element.style.color = "#6A6A6A";
                    }
                }
            });
        }
    };

    eventHandlerFunctions[ 'syncingDone' ] = function( eventName, parameters  )
    {
        console.log( "syncingDone " + parameters.sensor + ", " + parameters.isSuccess + ", " + parameters.isAllSuccess );

        if ( parameters.isAllSuccess != undefined )
        {
            if ( parameters.isAllSuccess )
            {
                console.log( "measuringPayloadId " + measuringPayloadId );

                stopMeasuringButton.innerHTML = "Starting...";

                for (  i = 0; i < connectedSensors.length; i++ )
                {
                    var sensor = [connectedSensors[i]];
                    sendGuiEvent( 'startMeasuring', {addresses:sensor, measuringPayloadId: measuringPayloadId} );
                }
            } else {
                enableOrDisableMeasurementControlButton();
                enableOrDisableConnectButtons(false);
            }

            syncingModal.style.display = 'none';
        }
    };

    eventHandlerFunctions[ 'readHeadingStatus' ] = function( eventName, parameters  )
    {
        console.log( "readHeadingStatus " + parameters.address + ", " + parameters.status );

        addLastHeadingStatus( parameters );
        updateHeadingResetButton();
    };
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
    var recordings = document.getElementById("recordings");
    if( files == undefined || files.length == 0 )
    {
        if(recordings.hasChildNodes())
        {
            while( recordings.firstChild ) 
            {
            recordings.removeChild(recordings.firstChild);
            }
        }
    }
    else
    {
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
            link.style.color = "#FFFFFF";
            link.style.marginLeft = "8px";
            link.innerHTML = file;
            newLine = document.createElement( "br" );
    
            recordings.appendChild(label);
            label.appendChild(checkbox);
            label.appendChild(link);
            label.appendChild(newLine);
        });
    }
    
}

function enableOrDisableConnectButtons(disabled)
{
    discoveredSensors.forEach( function (address)
    {
        var element = document.getElementById(ID_CONNECTION_CONTROL_BUTTON + address);
        if (element != null)
        {
            element.disabled = disabled;
        }
    });
}

function enableOrDisableMeasurementControlButton()
{
    measurementControlButton.disabled = connectedSensors.length == 0;
    measurementControlButton.hidden = connectedSensors.length == 0 || measuringSensors.length != 0;

    syncControlButton.hidden = measurementControlButton.hidden;

    if (measuringSensors.length == 0)
        measurementPayloadList.style.display = '';

    stopMeasuringButton.hidden = measuringSensors.length == 0;
}

function loadConnectedSensors( connectedSensors )
{
    console.log("loadConnectedSensors " + connectedSensors);

    if (connectedSensors != null && connectedSensors != undefined) {
        this.connectedSensors = connectedSensors;

        this.connectedSensors.forEach( function (address)
        {
            addSensorToList( discoveredSensors, "DiscoveredSensors", address );

            var logoImage = document.getElementById(ID_LOGO_IMAGE + address);
            if (logoImage != null)
            {
                logoImage.src = "Xsens_DOT_connected.png";
            }

            var element = document.getElementById(ID_CONNECTION_CONTROL_BUTTON + address);
            if (element != null)
            {
                element.innerHTML = TEXT_DISCONNECT;
                element.disabled = false;
                element.style.color = "#FFFFFF";
                element.style.background = "#EA6852";
                element.onmouseover = onButtonMouseOver;
                element.onmouseout = onButtonMouseOver;
            }
    
            enableOrDisableMeasurementControlButton();
        });
    }
}

function addSensorToList( sensorList, sensorListName, address, clickHandler )
{
    sensorList.push( address );

    var lineHeight = "38px";

    var sensorListElement = document.getElementById(sensorListName);

    var label = document.createElement("div");
    label.setAttribute( "id", sensorListName+address );
    label.style.width = "500px";
    label.style.display = "flex";

    sensorListElement.appendChild(label);

    var logo = document.createElement("img");
    logo.id = ID_LOGO_IMAGE + address;
    logo.src = "Xsens_DOT_disconnected.png";
    logo.style.width = "32px";
    logo.style.height = lineHeight;
    label.appendChild(logo);

    var sensorDataIndicatorDiv = document.createElement("div");
    sensorDataIndicatorDiv.style.width = "32px";
    sensorDataIndicatorDiv.style.height = lineHeight;
    sensorDataIndicatorDiv.style.display = "box";
    sensorDataIndicatorDiv.style.boxPack = "center";
    sensorDataIndicatorDiv.style.background = "#00000000";
    sensorDataIndicatorDiv.style.boxOrient = "vertical";
    sensorDataIndicatorDiv.textAlign = "center";

    var sensorDataIndicator = document.createElement("label");
    sensorDataIndicator.id = ID_SENSOR_DATA_INDICATOR + address;
    sensorDataIndicator.style.width = "16px";
    sensorDataIndicator.style.height = "16px";
    sensorDataIndicator.style.color = "#00000000";
    sensorDataIndicator.innerHTML = "▶";
    sensorDataIndicator.style.lineHeight = lineHeight;
    sensorDataIndicator.style.background = "#00000000";
    sensorDataIndicator.style.margin = "0px";

    sensorDataIndicatorDiv.appendChild(sensorDataIndicator);
    label.appendChild(sensorDataIndicatorDiv);

    var sensorAddress = document.createElement('label');
    sensorAddress.innerHTML = address;
    sensorAddress.style.padding = "10px";
    sensorAddress.style.color = "#FFFFFF";
    sensorAddress.style.flex = "1";
    sensorAddress.style.fontSize = "16px";
    label.appendChild(sensorAddress);

    var connectionControlButton = document.createElement("button");
    connectionControlButton.id = ID_CONNECTION_CONTROL_BUTTON + address;
    connectionControlButton.name = address;
    connectionControlButton.innerHTML = TEXT_CONNECT;
    initButtonStyle(connectionControlButton);

    connectionControlButton.onclick = connectionControlButtonClicked;
    connectionControlButton.onmouseover = onButtonMouseOver;
    connectionControlButton.onmouseout = onButtonMouseOut;

    label.appendChild(connectionControlButton);

    var newLine = document.createElement( "br" );
    label.appendChild(newLine);
}

function initButtonStyle(connectionControlButton)
{
    connectionControlButton.style.marginLeft = "20px";
    connectionControlButton.style.width = "140px";
    connectionControlButton.style.height = "36px";
    connectionControlButton.style.outline = "none";
    connectionControlButton.style.border = "2px solid #43425D";
    connectionControlButton.style.borderRadius = "4px";
    connectionControlButton.style.opacity = "1";
    connectionControlButton.style.textAlign = "center";
    connectionControlButton.style.font = "12px 'Montserrat'";
    connectionControlButton.style.letterSpacing = "0";
    connectionControlButton.style.color = "#EA6852";
    connectionControlButton.style.fontWeight = "bold";
    connectionControlButton.style.background = "#FFFFFF";
}

function onButtonMouseOver()
{
    this.style.marginLeft = "20px";
    this.style.width = "140px";
    this.style.height = "36px";
    this.style.outline = "none";
    this.style.border = "2px solid #43425D";
    this.style.borderRadius = "4px";
    this.style.opacity = "1";
    this.style.textAlign = "center";
    this.style.font = "12px 'Montserrat'";
    this.style.letterSpacing = "0";
    this.style.color = "#FFFFFF";
    this.style.fontWeight = "bold";
    this.style.background = "#EA6852";
}

function onButtonMouseOut()
{
    initButtonStyle(this);
}

function removeSensor( sensorList, address )
{
    var idx = sensorList.indexOf( address );
    if( idx == -1 ) return;

    sensorList.splice(idx,1);
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
        sensorList.splice(idx, 1);
    }
}

function addLastHeadingStatus( parameters )
{
    var idx = -1;

    lastHeadingStatusList.forEach( function (item)
    {
        if (item.address == parameters.address)
        {
            item.status = parameters.status;
            idx++;
        }
    });

    if( idx == -1 )
    {
        lastHeadingStatusList.push( parameters );
    }

    console.log( "Add lastHeadingStatusList " + lastHeadingStatusList );
}

function removeLastHeadingStatus( address )
{
    var idx = -1;

    for (var i = 0; i < lastHeadingStatusList.length; i++)
    {
        if (lastHeadingStatusList[i].address == address)
        {
            idx = i;
            break;
        }
    }

    if( idx != -1 )
    {
        lastHeadingStatusList.splice( idx, 1 );
    }

    console.log( "Remove lastHeadingStatusList " + lastHeadingStatusList );
}

function hasHeadingResetDevice()
{
    for (var i = 0; i < lastHeadingStatusList.length; i++)
    {
        if (lastHeadingStatusList[i].status == HEADING_STATUS_XRM_HEADING)
        {
            return true;
        }
    }

    return false;
}

function updateHeadingResetButton()
{
    if (hasHeadingResetDevice())
    {
        headingResetButton.innerHTML = 'Heading Revert';
    }
    else
    {
        headingResetButton.innerHTML = 'Heading Reset';
    }
}

function scanControlButtonClicked()
{
    if( scanControlButton.innerHTML == 'Start Scanning' )
    {
        sendGuiEvent( 'startScanning' );
        scanControlButton.innerHTML = 'Starting...';
        scanControlButton.disabled = true;

        while( discoveredSensors.length != 0 )
        {
            removeSensorFromList( discoveredSensors, "DiscoveredSensors", discoveredSensors[0] );
        }

        loadConnectedSensors(connectedSensors);

        if (scanningTimeoutId > 0)
            clearTimeout(scanningTimeoutId);

        scanningTimeoutId = setTimeout(() => {
            stopScanning();
        }, 15000);
    }
    else
    {
        stopScanning();
    }
}

function stopScanning()
{
    if( scanControlButton.innerHTML == 'Stop Scanning' )
    {
        sendGuiEvent( 'stopScanning' );
        scanControlButton.innerHTML = 'Stopping...';
        scanControlButton.disabled = true;
    }
}

function connectionControlButtonClicked()
{
    stopScanning();

    if( this.innerHTML == TEXT_CONNECT )
    {
        var sensor = [this.name];

        sendGuiEvent( 'connectSensors', {addresses:sensor} );
        this.innerHTML = "Stop connecting"
    }
    else if( this.innerHTML == 'Stop connecting')
    {
        var sensor = [this.name];
        sendGuiEvent( 'stopConnectingSensors', {addresses:sensor} );
        this.disabled = false;

        this.innerHTML = TEXT_CONNECT;
    }
    else if( this.innerHTML == TEXT_DISCONNECT )
    {
        var sensor = [this.name];
        sendGuiEvent( 'disconnectSensors', {addresses:sensor} );
        this.disabled = true;
        this.innerHTML = "Disconnecting..."
    }
}

function headingResetButtonClicked()
{
    updateHeadingResetButton();

    if (headingResetButton.innerHTML == 'Heading Reset')
    {
        sendGuiEvent( 'resetHeading', {measuringSensors: measuringSensors} );

        headingResetButton.disabled = true;
        setTimeout(() => {
            headingResetButton.innerHTML = 'Heading Revert';
            headingResetButton.disabled = false;
        }, 1000);
    }
    else if (headingResetButton.innerHTML == 'Heading Revert')
    {
        sendGuiEvent( 'revertHeading', {measuringSensors: measuringSensors} );

        headingResetButton.disabled = true;
        setTimeout(() => {
            headingResetButton.innerHTML = 'Heading Reset';
            headingResetButton.disabled = false;
        }, 1000);
    }
}

function measurementControlButtonClicked(payloadId)
{
    console.log("payloadId " + payloadId);

    stopScanning();

    measuringPayloadId = payloadId;

    if( measurementControlButton.innerHTML == 'Start Logging' )
    {
        measurementControlButton.disabled = true;
        scanControlButton.disabled = true;

        measurementPayloadList.style.display = 'none';
        measurementControlButton.hidden = true;

        syncControlButton.hidden = measurementControlButton.hidden;

        stopMeasuringButton.hidden = false;

        if (isSyncingEnabled)
        {
            stopMeasuringButton.innerHTML = "Syncing...";
            stopMeasuringButton.disabled = true;

            sendGuiEvent( 'startSyncing', {} );
            enableOrDisableConnectButtons(true);
            syncingModal.style.display = 'block';
        }
        else
        {
            stopMeasuringButton.innerHTML = "Starting...";

            for (  i = 0; i < connectedSensors.length; i++ )
            {
                var sensor = [connectedSensors[i]];
                sendGuiEvent( 'startMeasuring', {addresses:sensor, measuringPayloadId: measuringPayloadId} );
            }

            enableOrDisableConnectButtons(true);
        }
    }
}

function syncControlButtonClicked()
{
    if (syncControlButton.innerHTML == 'Disable Sync')
    {
        syncControlButton.innerHTML = 'Enable Sync';
        isSyncingEnabled = false;
    }
    else
    {
        syncControlButton.innerHTML = 'Disable Sync';
        isSyncingEnabled = true;
    }

    sendGuiEvent( 'enableSync', {isSyncingEnabled: isSyncingEnabled} );
}

function stopMeasuringButtonClicked()
{
    sendGuiEvent( 'stopRecording' );

    stopMeasuringButton.disabled = true;
    stopMeasuringButton.innerHTML = "Stoping..."

    for (  i = 0; i < measuringSensors.length; i++ )
    {
        var address = measuringSensors[i];
        var sensor = [address];
        sendGuiEvent( 'stopMeasuring', {addresses:sensor, measuringPayloadId: measuringPayloadId} );

        var element = document.getElementById(ID_SENSOR_DATA_INDICATOR + address);
        if (element != null)
        {
            element.style.color = "#00000000";
            element.style.background = "#00000000";
        }
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
// -- Get connected sensors --
// ---------------------------------------------------------------------------------------
function getConnectedSensors()
{
    socket.emit( 'getConnectedSensors' );
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
// -- Handle 'connectedSensors' --
// ---------------------------------------------------------------------------------------
socket.on( 'connectedSensors', function( connectedSensors )
{
    if( typeof loadConnectedSensors === 'undefined' )
    {
        console.log( "WARNING 'loadConnectedSensors()' function not defined on page!" )
    }
    else loadConnectedSensors( connectedSensors );
});

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


