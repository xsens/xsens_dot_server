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
const SENSOR_NAME                          = "Xsens DOT",
      SENSOR_ENABLE                        = 0x01,
      SENSOR_DISABLE                       = 0x00,
      BLE_UUID_CONTROL                     = "15172001494711e98646d663bd873d93",
      BLE_UUID_MEASUREMENT_MEDIATE_PAYLOAD = "15172003494711e98646d663bd873d93",
      ROLLOVER                             = 4294967295,
      CLOCK_DELTA                          = 0.0002,
      TWO_POW_TWELVE                       = Math.pow(2, 12);

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
                    var addresses = [sensor.address];
                    bleHandler.sendBleEvent( 'bleSensorDisconnected', { sensor:sensor, addresses:addresses } );

                    var idx = globalConnectedSensors.indexOf( sensor );
                    if( idx != -1 )
                    {
                        globalConnectedSensors.splice( idx, 1 );

                        console.log('Remove global connected sensor ' + sensor.address);
                    }
                });

                var addresses = [sensor.address];
                bleHandler.sendBleEvent( 'bleSensorConnected', { sensor:sensor, addresses:addresses } );

                globalConnectedSensors.push( sensor );
                console.log('Add global connected sensor ' + sensor.address);
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
    enableSensor( sensor, measuringPayloadId )
    {
        var bleHandler = this,
            controlCharacteristic     = sensor.characteristics[BLE_UUID_CONTROL],
            measurementCharacteristic = sensor.characteristics[BLE_UUID_MEASUREMENT_MEDIATE_PAYLOAD];

        var buffer = Buffer.from( [0x01, SENSOR_ENABLE, measuringPayloadId] );

        if( measurementCharacteristic.listenerCount('data') == 0 )
        {
            measurementCharacteristic.on('data', function(data)
            {
                bleHandler.sendBleEvent
                ( 
                    "bleSensorData", 
                    convertSensorData( sensor, data, measuringPayloadId )
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

                var addresses = [sensor.address];

                bleHandler.sendBleEvent(  'bleSensorEnabled', { sensor:sensor, addresses:addresses } );
            });
        });
    }

    // -----------------------------------------------------------------------------------
    // -- Disable sensor --
    // -----------------------------------------------------------------------------------
    disableSensor( sensor, measuringPayloadId )
    {
        var bleHandler = this,
            controlCharacteristic     = sensor.characteristics[BLE_UUID_CONTROL],
            measurementCharacteristic = sensor.characteristics[BLE_UUID_MEASUREMENT_MEDIATE_PAYLOAD];

        measurementCharacteristic.removeAllListeners();

        var buffer = Buffer.from( [0x01, SENSOR_DISABLE, measuringPayloadId] );

        controlCharacteristic.write( buffer, false, function(error)
        {
            if( error )
            {
                bleHandler.sendBleEvent( 'bleSensorError', { sensor:sensor, error: error } );
                return;
            }

            var addresses = [sensor.address];

            bleHandler.sendBleEvent( 'bleSensorDisabled', { sensor:sensor, addresses:addresses } );
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
function convertSensorData( sensor, data, measuringPayloadId )
{
    const hrTime = process.hrtime();
    var systemtime = hrTime[0] * 1000000 + hrTime[1] / 1000;

    setSynchronizedTimestamp( sensor, data, systemtime );

    switch (measuringPayloadId)
    {
        case MEASURING_PAYLOAD_TYPE_COMPLETE_EULER:
            var euler = getEuler(data, 4);
            var freeAcceleration = getFreeAcceleration(data, 16);

            var result =
            {
                timestamp: sensor.systemTimestamp,
                address:   sensor.address,
                euler_x:   euler.x,
                euler_y:   euler.y,
                euler_z:   euler.z,
                freeAcc_x: freeAcceleration.x,
                freeAcc_y: freeAcceleration.y,
                freeAcc_z: freeAcceleration.z
            };

            // console.log("Payload id 16 bleSensorData " + result.timestamp + ", " + result.address 
            //     + ", euler_x " + result.euler_x + ", euler_y " + result.euler_y + ", euler_z " + result.euler_z
            //     + ", freeAcc_x " + result.freeAcc_x + ", freeAcc_y " + result.freeAcc_y + ", freeAcc_z " + result.freeAcc_z);

            return result;
            
        case MEASURING_PAYLOAD_TYPE_EXTENDED_QUATERNION:
            var quaternion = getOrientationQuaternion(data, 4);
            var freeAcceleration = getFreeAcceleration(data, 20);
            var status = getSnapshotStatus(data, 32);
            var clipCountAcc = getClipCountAcc(data, 34);
            var clipCountGyr = getClipCountGyr(data, 35);

            var result =
            {
                timestamp:    sensor.systemTimestamp,
                address:      sensor.address,
                quaternion_w: quaternion.w,
                quaternion_x: quaternion.x,
                quaternion_y: quaternion.y,
                quaternion_z: quaternion.z,
                freeAcc_x:    freeAcceleration.x,
                freeAcc_y:    freeAcceleration.y,
                freeAcc_z:    freeAcceleration.z,
                status:       status,
                clipCountAcc: clipCountAcc,
                clipCountGyr: clipCountGyr
            };

            // console.log("Payload id 2 bleSensorData " + result.timestamp + ", " + result.address 
            //     + ", quaternion_w " + result.quaternion_w + ", quaternion_x " + result.quaternion_x + ", quaternion_y " + result.quaternion_y + ", quaternion_z " + result.quaternion_z
            //     + ", freeAcc_x " + result.freeAcc_x + ", freeAcc_y " + result.freeAcc_y + ", freeAcc_z " + result.freeAcc_z
            //     + ", status " + result.status + ", clipCountAcc " + result.clipCountAcc + ", clipCountGyr " + result.clipCountGyr);

            return result;

        case MEASURING_PAYLOAD_TYPE_RATE_QUANTITIES_WITH_MAG:
            var acc = getAcceleration(data, 4);
            var gyr = getAngularVelocity(data, 16);
            var mag = getCalibratedMag(data, 28);

            var result =
            {
                timestamp:    sensor.systemTimestamp,
                address:      sensor.address,
                acc_x:        acc.x,
                acc_y:        acc.y,
                acc_z:        acc.z,
                gyr_x:        gyr.x,
                gyr_y:        gyr.y,
                gyr_z:        gyr.z,
                mag_x:        mag.x,
                mag_y:        mag.y,
                mag_z:        mag.z
            };

            // console.log("Payload id 20 bleSensorData " + result.timestamp + ", " + result.address 
            //     + ", acc_x " + result.acc_x + ", acc_y " + result.acc_y + ", acc_z " + result.acc_z
            //     + ", gyr_x " + result.gyr_x + ", gyr_y " + result.gyr_y + ", gyr_z " + result.gyr_z
            //     + ", mag_x " + result.mag_x + ", mag_y " + result.mag_y + ", mag_z " + result.mag_z);

            return result;

        case MEASURING_PAYLOAD_TYPE_CUSTOM_MODE_1:
            var euler = getEuler(data, 4);
            var freeAcceleration = getFreeAcceleration(data, 16);
            var gyr = getAngularVelocity(data, 28);

            var result =
            {
                timestamp: sensor.systemTimestamp,
                address:   sensor.address,
                euler_x:   euler.x,
                euler_y:   euler.y,
                euler_z:   euler.z,
                freeAcc_x: freeAcceleration.x,
                freeAcc_y: freeAcceleration.y,
                freeAcc_z: freeAcceleration.z,
                gyr_x:     gyr.x,
                gyr_y:     gyr.y,
                gyr_z:     gyr.z
            };

            return result;

        case MEASURING_PAYLOAD_TYPE_CUSTOM_MODE_2:
            var euler = getEuler(data, 4);
            var freeAcceleration = getFreeAcceleration(data, 16);
            var mag = getCalibratedMag(data, 28);

            var result =
            {
                timestamp: sensor.systemTimestamp,
                address:   sensor.address,
                euler_x:   euler.x,
                euler_y:   euler.y,
                euler_z:   euler.z,
                freeAcc_x: freeAcceleration.x,
                freeAcc_y: freeAcceleration.y,
                freeAcc_z: freeAcceleration.z,
                mag_x:     mag.x,
                mag_y:     mag.y,
                mag_z:     mag.z
            };

            return result;

        case MEASURING_PAYLOAD_TYPE_CUSTOM_MODE_3:
            var quaternion = getOrientationQuaternion(data, 4);
            var gyr = getAngularVelocity(data, 20);

            var result =
            {
                timestamp:    sensor.systemTimestamp,
                address:      sensor.address,
                quaternion_w: quaternion.w,
                quaternion_x: quaternion.x,
                quaternion_y: quaternion.y,
                quaternion_z: quaternion.z,
                gyr_x:        gyr.x,
                gyr_y:        gyr.y,
                gyr_z:        gyr.z
            };

            return result;

        default:
            return {};
    }
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

// ---------------------------------------------------------------------------------------
// -- Get euler --
// ---------------------------------------------------------------------------------------
function getEuler(data, offset)
{
    var x,y,z;
    
    x = data.readFloatLE(offset);
    y = data.readFloatLE(offset + 4);
    z = data.readFloatLE(offset + 8);

    return {x:x, y:y, z:z};
}

// ---------------------------------------------------------------------------------------
// -- Get free acceleration --
// ---------------------------------------------------------------------------------------
function getFreeAcceleration(data, offset)
{
    var x,y,z;
    
    x = data.readFloatLE(offset);
    y = data.readFloatLE(offset + 4);
    z = data.readFloatLE(offset + 8);

    return {x:x, y:y, z:z};
}

// ---------------------------------------------------------------------------------------
// -- Get orientation quaternion --
// ---------------------------------------------------------------------------------------
function getOrientationQuaternion(data, offset)
{
    var w,x,y,z;
    
    w = data.readFloatLE(offset);
    x = data.readFloatLE(offset + 4);
    y = data.readFloatLE(offset + 8);
    z = data.readFloatLE(offset + 12);

    return {w:w, x:x, y:y, z:z};
}

// ---------------------------------------------------------------------------------------
// -- Get snapshot status --
// ---------------------------------------------------------------------------------------
function getSnapshotStatus(data, offset)
{
    var status = data.readInt16LE(offset);
    status = (status & 0x1FF) << 8;

    return status;
}

// ---------------------------------------------------------------------------------------
// -- Get acceleration clip count --
// ---------------------------------------------------------------------------------------
function getClipCountAcc(data, offset)
{
    return  data.readInt8(offset);
}

// ---------------------------------------------------------------------------------------
// -- Get angular velocity clip count --
// ---------------------------------------------------------------------------------------
function getClipCountGyr(data, offset)
{
    return  data.readInt8(offset);
}

// ---------------------------------------------------------------------------------------
// -- Get acceleration --
// ---------------------------------------------------------------------------------------
function getAcceleration(data, offset)
{
    var x,y,z;
    
    x = data.readFloatLE(offset);
    y = data.readFloatLE(offset + 4);
    z = data.readFloatLE(offset + 8);

    return {x:x, y:y, z:z};
}

// ---------------------------------------------------------------------------------------
// -- Get angular velocity --
// ---------------------------------------------------------------------------------------
function getAngularVelocity(data, offset)
{
    var x,y,z;
    
    x = data.readFloatLE(offset);
    y = data.readFloatLE(offset + 4);
    z = data.readFloatLE(offset + 8);

    return {x:x, y:y, z:z};
}

// ---------------------------------------------------------------------------------------
// -- Get calibrated mag --
// ---------------------------------------------------------------------------------------
function getCalibratedMag(data, offset)
{
    var x,y,z;
    
    x = data.readInt16LE(offset);
    y = data.readInt16LE(offset + 2);
    z = data.readInt16LE(offset + 4);

    x = x / TWO_POW_TWELVE;
    y = y / TWO_POW_TWELVE;
    z = z / TWO_POW_TWELVE;

    return {x:x, y:y, z:z};
}

// =======================================================================================
// Export the BleHandler class
// =======================================================================================
module.exports = BleHandler;

