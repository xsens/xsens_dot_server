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
// BLE Handler
// Documentation: documentation/Xsens DOT Server - BLE Handler.pdf
// =======================================================================================

// =======================================================================================
// Packages
// =======================================================================================
var Quaternion = require('quaternion');

// =======================================================================================
// Constants
// =======================================================================================
const SENSOR_NAME          = "Xsens DOT",
      SENSOR_ENABLE        = 0x01,
      SENSOR_DISABLE       = 0x00,
      BLE_UUID_CONTROL     = "15172001494711e98646d663bd873d93",
      BLE_UUID_MEASUREMENT = "15172004494711e98646d663bd873d93",
      ROLLOVER             = 4294967295,
      CLOCK_DELTA          = 0.0002;

// =======================================================================================
// Class definition
// =======================================================================================

class BleHandler 
{
    constructor( bleEventsInterface )
    {
        this.bleEvents = bleEventsInterface;
        this.discoveredSensorCounter = 0;
        this.central = require('noble-mac');
        this.setBleEventHandlers(this);

        console.log( "BLE Handler started." );
    }

    // -----------------------------------------------------------------------------------
    // -- Set BLE Handlers --
    // -----------------------------------------------------------------------------------
    setBleEventHandlers()
    {
        var bleHandler = this,
            central    = this.central;

        central.on( 'stateChange', function(state)
        {
            if( state == 'poweredOn' )
            {
                bleHandler.sendBleEvent( 'blePoweredOn' );
            }
        });

        central.on( 'scanStart', function()
        {
            bleHandler.sendBleEvent( 'bleScanningStarted' );
        });

        central.on( 'scanStop', function()
        {
            bleHandler.sendBleEvent( 'bleScanningStopped' );
        });

        central.on( 'discover', function(peripheral)
        {
            var localName = peripheral.advertisement.localName;

            if( localName && localName == SENSOR_NAME )
            {
                if( peripheral.address == undefined || peripheral.address == "" )
                {
                    peripheral.address = (bleHandler.discoveredSensorCounter++).toString(16);
                }

                var sensor = peripheral;
                sensor.name = peripheral.advertisement.localName;
                sensor.characteristics = {};
                sensor.systemTimestamp = 0;
                sensor.sensorTimestamp = 0;

                bleHandler.sendBleEvent( 'bleSensorDiscovered', {sensor:sensor} );
            }
        });
    }

    // -----------------------------------------------------------------------------------
    // -- Start scanning --
    // -----------------------------------------------------------------------------------
    startScanning()
    {
        this.central.startScanning( [], true );
    }

    // -----------------------------------------------------------------------------------
    // -- Stop scanning --
    // -----------------------------------------------------------------------------------
    stopScanning()
    {
        this.central.stopScanning();
    }
    
    // -----------------------------------------------------------------------------------
    // -- Connect sensor --
    // -----------------------------------------------------------------------------------
    connectSensor( sensor )
    {
        var bleHandler = this;

        sensor.removeAllListeners();
        sensor.connect( function(error)
        {
            if( error )
            {
                bleHandler.sendBleEvent( 'bleSensorError', { sensor:sensor, error:error } );
                return;
            }
            sensor.discoverAllServicesAndCharacteristics( function(error, services, characteristics)
            {
                if( error )
                {
                    bleHandler.disconnectSensor( sensor );
                    bleHandler.sendBleEvent( 'bleSensorError', { sensor:sensor, error: error } );
                    return;
                }
                sensor.characteristics = {};
                characteristics.forEach( function( characteristic )
                {
                    sensor.characteristics[characteristic.uuid] = characteristic;
                });

                sensor.on( 'disconnect', function()
                {
                    bleHandler.sendBleEvent( 'bleSensorDisconnected', { sensor:sensor } );
                });
                bleHandler.sendBleEvent( 'bleSensorConnected', { sensor:sensor } );
            });
        });
    }

    // -----------------------------------------------------------------------------------
    // -- Send BLE event --
    // -----------------------------------------------------------------------------------
    sendBleEvent( eventName, parameters )
    {
        var bleHandler = this;
        if( eventName == 'bleSensorError' )
        {
            setTimeout( function()
            {
                bleHandler.bleEvents.emit( 'bleEvent', eventName, parameters );
            },10);
            return;
        }
        bleHandler.bleEvents.emit( 'bleEvent', eventName, parameters );
    }

    // -----------------------------------------------------------------------------------
    // -- Enable sensor --
    // -----------------------------------------------------------------------------------
    enableSensor( sensor )
    {
        var bleHandler = this,
            controlCharacteristic     = sensor.characteristics[BLE_UUID_CONTROL],
            measurementCharacteristic = sensor.characteristics[BLE_UUID_MEASUREMENT];

        var buffer = Buffer.from( [0x01, SENSOR_ENABLE, 0x05] );

        if( measurementCharacteristic.listenerCount('data') == 0 )
        {
            measurementCharacteristic.on('data', function(data)
            {
                bleHandler.sendBleEvent
                ( 
                    "bleSensorData", 
                    convertSensorData( sensor, data )
                );
            });
        }

        controlCharacteristic.write( buffer, false, function(error)
        {
            if( error )
            {
                bleHandler.sendBleEvent( 'bleSensorError', { sensor:sensor, error: error } );
                return;
            }

            measurementCharacteristic.subscribe( function(error)
            {
                if( error )
                {
                    bleHandler.sendBleEvent( 'bleSensorError', { sensor:sensor, error: error } );
                    return;
                }

                bleHandler.sendBleEvent(  'bleSensorEnabled', { sensor:sensor } );
            });
        });
    }

    // -----------------------------------------------------------------------------------
    // -- Disable sensor --
    // -----------------------------------------------------------------------------------
    disableSensor( sensor )
    {
        var bleHandler = this,
            controlCharacteristic     = sensor.characteristics[BLE_UUID_CONTROL],
            measurementCharacteristic = sensor.characteristics[BLE_UUID_MEASUREMENT];

        measurementCharacteristic.removeAllListeners();

        var buffer = Buffer.from( [0x01, SENSOR_DISABLE, 0x05] );

        controlCharacteristic.write( buffer, false, function(error)
        {
            if( error )
            {
                bleHandler.sendBleEvent( 'bleSensorError', { sensor:sensor, error: error } );
                return;
            }

            bleHandler.sendBleEvent( 'bleSensorDisabled', { sensor:sensor } );
        });
    }

    // -----------------------------------------------------------------------------------
    // -- Disconnect sensor --
    // -----------------------------------------------------------------------------------
    disconnectSensor( sensor )
    {
        sensor.disconnect( function(error)
        {
            if( error )
            {
                bleHandler.sendBleEvent( 'bleSensorError', { sensor:sensor, error: error } );
                return;
            }
        });
    }
}

// =======================================================================================
// Local functions
// =======================================================================================

// ---------------------------------------------------------------------------------------
// -- Convert sensor data --
// ---------------------------------------------------------------------------------------
function convertSensorData( sensor, data )
{
    const hrTime = process.hrtime();
    var systemtime = hrTime[0] * 1000000 + hrTime[1] / 1000;

    setSynchronizedTimestamp( sensor, data, systemtime );

    var orientation = getOrientation(data);
    var result =     
    {
        timestamp: sensor.systemTimestamp,
        address:   sensor.address,
        q_w:       orientation.w,
        q_x:       orientation.x,
        q_y:       orientation.y,
        q_z:       orientation.z,
    };

    return result;
}

// ---------------------------------------------------------------------------------------
// -- Set synchronized timestamp --
// ---------------------------------------------------------------------------------------
function setSynchronizedTimestamp( sensor, data, systemtime )
{
    var sensorTimestamp = getSensorTimestamp( data );

    if( sensor.systemTimestamp == 0 )
    {
        sensor.systemTimestamp = systemtime;
        sensorTimestamp = sensorTimestamp;
        return;
    }

    var sensorTimeDiff = sensorTimestamp - sensor.sensorTimestamp;
    if( sensorTimeDiff < 0 )
    {
        sensorTimeDiff += ROLLOVER;
    }
    sensor.sensorTimestamp = sensorTimestamp;

    
    sensor.systemTimestamp = sensor.systemTimestamp + sensorTimeDiff*(1+CLOCK_DELTA);


    if( sensor.systemTimestamp > systemtime )
    {
        sensor.systemTimestamp = systemtime;
    }


}

// ---------------------------------------------------------------------------------------
// -- Get orientation --
// ---------------------------------------------------------------------------------------
function getOrientation(data)
{
    var w,x,y,z;
    
    w = data.readFloatLE(4);
    x = data.readFloatLE(8);
    y = data.readFloatLE(12);
    z = data.readFloatLE(16);

    return new Quaternion(w, x, y, z);
}

// ---------------------------------------------------------------------------------------
// -- Get sensor timestamp --
// ---------------------------------------------------------------------------------------
function getSensorTimestamp(data)
{
    return data.readUInt32LE(0);
}

// =======================================================================================
// Export the BleHandler class
// =======================================================================================
module.exports = BleHandler;

