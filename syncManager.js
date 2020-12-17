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
// Class definition
// =======================================================================================
class SyncManager
{
    constructor( bleHandler, gui, syncingEvents )
    {
        var component      = this;
        this.bleHandler    = bleHandler;
        this.gui           = gui;
        this.syncingEvents = syncingEvents;

        this.currentProgress  = 0;
        this.syncingTimeoutId = -1;
        this.syncingDoneList  = [];

        this.init();
    }

    init()
    {
        var component = this;

        this.syncingEvents.on( 'syncingEvent', function( eventName, parameters )
        {
            component.eventHandler( eventName, parameters );
        });
    }

    eventHandler( eventName, parameters )
    {
        console.log( parameters.sensor.address + " Syncing eventName " + eventName );

        var component = this;

        switch(eventName) {
            case 'bleSensorDisconnected':
                setTimeout( function()
                {
                    component.bleHandler.connectSensor( parameters.sensor );
                }, 12000);
                break;

            case 'bleSensorConnected':
                setTimeout( function()
                {
                    component.bleHandler.readRecordingAck( parameters.sensor );
                }, 1500);
                break;

            case 'bleSensorSyncingDone':
                console.log( parameters.sensor.address + " isSuccess " + parameters.isSuccess );

                component.syncingDoneList.push( {sensor: parameters.sensor, isSuccess: parameters.isSuccess} );

                console.log( parameters.sensor.address + " syncing done list: " + component.syncingDoneList );

                // component.gui.sendGuiEvent( 'syncingDone', {sensor: parameters.sensor, isSuccess: parameters.isSuccess} );

                component.onSyncingDone();
                break;
        }
    }

    startSyncing()
    {
        console.log( "startSyncing isInSyncingProgress " + isInSyncingProgress );

        if ( isInSyncingProgress )
        {
            return;
        }

        var component = this;
        isInSyncingProgress = true;
        globalSyncingSensors = [];
        this.currentProgress = 0;
        this.syncingDoneList = [];

        if ( this.syncingTimeoutId != undefined )
        {
            clearTimeout( this.syncingTimeoutId );
        }

        this.syncingTimeoutId = setTimeout( function()
        {
            console.log("Syncing timeout");

            if ( isInSyncingProgress ) {
                isInSyncingProgress = false;
                component.onSyncingDone();
            }
        }, 48000);

        var isSuccess = false;
        var rootAddress = "";

        globalConnectedSensors.forEach( function (sensor)
        {
            if ( rootAddress == "" )
            {
                rootAddress = sensor.address;
            }

            globalSyncingSensors.push( sensor );
        });

        console.log( "startSyncing root " + rootAddress + ", devices " + globalSyncingSensors );

        globalSyncingSensors.forEach( function (sensor)
        {
            component.bleHandler.startSyncing(sensor, rootAddress);
        });

        setTimeout( function()
        {

            if ( isInSyncingProgress )
            {
                globalSyncingSensors.forEach( function (sensor)
                {
                    component.bleHandler.disconnectSensor(sensor);
                });
            }
        }, 800);
    }

    onSyncingDone()
    {
        console.log( "onSyncingDone " + globalConnectedSensors.length + ", " + globalSyncingSensors.length + ", " + this.syncingDoneList.length );

        if ( globalConnectedSensors.length == globalSyncingSensors.length
            && this.syncingDoneList.length == globalSyncingSensors.length ) 
        {
            isInSyncingProgress = false;
            
            var successCount = 0;
            this.syncingDoneList.forEach( function(item)
            {
                if ( item.isSuccess )
                {
                    successCount++;
                }
            });

            var isAllSuccess = ( successCount == this.syncingDoneList.length );

            this.gui.sendGuiEvent( 'syncingDone', {isAllSuccess: isAllSuccess} );

            if ( this.syncingTimeoutId != undefined )
            {
                clearTimeout( this.syncingTimeoutId );
            }
        } 
        else if ( !isInSyncingProgress ) 
        {
            this.gui.sendGuiEvent( 'syncingDone', {isAllSuccess: false} );
        }
    }

}

// =======================================================================================
// Export the SyncManager class
// =======================================================================================
module.exports = SyncManager;