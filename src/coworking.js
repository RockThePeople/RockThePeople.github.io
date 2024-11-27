import React, { useState, useEffect } from 'react';
import miningResult from './run_shader';
import createSocketConnection from './socket';
import generateRandomHash from './generate_randomHash';
// import { useNavigate } from "react-router-dom";
import BlockSwiper from './getHistory';

const URL = "https://webgpu-server-ffwmi.run.goorm.site";
// const URL = "http://localhost:8000";

function Frontend() {
    const [isMiningEnabled, setIsMiningEnabled] = useState(false);
    const [deviceInfo, setDeviceInfo] = useState({ device: "none", dispatch: 0, worksize: 0});
    const [result, setResult] = useState("initial");
    let keepWorking = true;

    // const movePage = useNavigate();

    useEffect(() => {
        if (!localStorage.getItem("pub_address")) {
            localStorage.setItem("pub_address", generateRandomHash(0));
        };
    }, [])

    const address = localStorage.getItem("pub_address");

    const selectDevice = (value) => {
        const deviceMap = {
            0: { device: "none", dispatch: 0, worksize: 0 },
            1: { device: "s22", dispatch: 500, worksize: 64 },
            2: { device: "m1air", dispatch: 3968, worksize: 64 },
            3: { device: "m1pro", dispatch: 4352, worksize: 64 },
            4: { device: "m3pro", dispatch: 28032, worksize: 64 }
        };
        setDeviceInfo(deviceMap[value] || 0);  // 매핑된 값이 없으면 기본값 0 설정
    };

    const toggleMining = () => {
        setIsMiningEnabled(!isMiningEnabled);
        if (isMiningEnabled) {
            window.location.reload();
        }
    };
    let hashs = [];
    const manualMining = async (target, dispatch, worksize, blockheader, iterate) => {
        const res = await miningResult(target, dispatch, worksize, blockheader, iterate, address);
        if (res[1] && res[2]) {
            keepWorking = false;
            setResult({ hash: res[1], nonce: res[2] })
            hashs.push(`${res[1]}, ${res[2]}`);
            return [res[0], res[1], res[2]];
        } else {
            return [res[0]];
        }
    };

    let epochInfo = {};
    const handleBigMessage = async (message) => {
        keepWorking = true;
        if (message.type === 'bigEpoch' && isMiningEnabled) {
            let iterate = (message.nonceRange)/(message.dispatch*message.worksize)
            epochInfo = { target: message.target, dispatch: message.dispatch, worksize: message.worksize, iterate: iterate};
        }
        let targetToStr = (message.target).map(byte => byte.toString(16).padStart(2, '0')).join('');
        targetToStr = targetToStr.toUpperCase();
        console.log(message);
        console.log("Target : ", targetToStr);
    };

    const handleLittleMessage = async (message) => {
        if (message.type === 'littleEpoch' && isMiningEnabled && keepWorking) {
            if (epochInfo.target && epochInfo.dispatch && epochInfo.worksize && epochInfo.nonceEnd) {
                console.log("No Epoch Error"); return;
            }
            console.log(message.header)
            for (let i = 0; i < epochInfo.iterate; i++) {
                if (!keepWorking) { return; }
                const res = await manualMining(epochInfo.target, epochInfo.dispatch, epochInfo.worksize, message.header, i);
                if (res[1] && res[2]) {
                    setResult({ hash: res[1], nonce: res[2] })
                    console.log(res[1]);
                    return;
                }
                console.log(`👷‍♂️⛏️ Round : ${i + 1}/${epochInfo.iterate + 1}, Work time : ${res[0]}`);
            }
        }
    };

    const handleStopWorking = async (message) => {
        if (message.type === 'stopWorking') {
            setResult("initial");
            keepWorking = false;
            console.log(`${message.miner}, ${message.hash}, ${message.nonce}`);
            hashs.push(`${message.miner}, ${message.hash}, ${message.nonce}`);
        };
    }

    useEffect(() => {
        const submit = createSocketConnection({
            address: address,
            url: URL,
            metaData: deviceInfo.device,
            onBigMessage: handleBigMessage,
            onLittleMessage: handleLittleMessage,
            onStopWorking: handleStopWorking,
            resultMessage: result,
            isMiningEnabled: isMiningEnabled
        });
        return submit;
    }, [address, deviceInfo.device, result, isMiningEnabled]);

    const [ hover, setHover ] = useState(false);

    return (
        <div style={{ backgroundColor: "#FEFEFE" }}>
            <div style={{ display: 'flex', justifyContent: "center" }}>
                <h2 style={{ fontFamily: "Times New Roman" }}>Federated Proof of Work Utilizing WebGPU-Enabled Mobile Devices</h2>
            </div>
            <div style={{ padding: "50px 20px",height:'65vh', display: 'flex', flexDirection: "row", justifyContent: "center", gap: "2%", backgroundColor: "#252525" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "42%", backgroundColor: "#FEFEFE", padding: "20px" }}>
                    <div style={{ border: "2px solid #252525", borderRadius: '5px', paddingLeft:'10px', display: 'flex', alignItems:"center", justifyContent:'space-evenly'}}>
                        <h4 style={{ marginBottom: "5px", minWidth:'fit-content', width:"40%" }}>Bidding Info</h4>
                        <div style={{borderLeft:"2px solid #252525", padding:"0px 10px 30px 10px", width :"60%"}}>
                            <h5 style={{ marginBottom: "10px" }}>Select Mobile Device</h5>
                            <select defaultValue={0} onChange={e => selectDevice(e.target.value)} style={{ fontSize: "20px" }}>
                                <option value={0}>Select Your Device</option>
                                <option value={1}>Samsung Galaxy S22 </option>
                                <option value={2}>Apple M1 Air(7GPUs)</option>
                                <option value={3}>Apple M1 Pro(8GPUs)</option>
                                <option value={4}>Apple M3 Pro(18GPUs)</option>
                            </select>
                            <h5 style={{ marginBottom: "0px" }}>Set Reward Function</h5>
                            <div style={{fontSize:'25px'}}>
                                <label> &alpha; : </label>
                                <input placeholder='-2500' style={{fontSize:'18px'}}/>
                                <br />
                                <label> &beta; : </label>
                                <input placeholder='0.01' style={{fontSize:'18px'}}/>
                            </div>

                            <h5 style={{ marginBottom: "0px" }}>Set Workload</h5>
                            <div>
                                <label> Workload : </label>
                                <input placeholder='50%' style={{fontSize:'20px'}} />
                            </div>
                        </div>
                    </div>
                    <div style={{ border: "2px solid #252525", borderRadius: '5px', paddingLeft:'10px', display: 'flex', alignItems:"center", justifyContent:'space-evenly'}}>
                        <h4 style={{ marginBottom: "5px", minWidth:'fit-content', width:"40%" }}>Bidding Result</h4>
                        <div style={{borderLeft:"2px solid #252525", padding:"0px 10px 30px 10px", width:"60%"}}>
                            <h5 style={{ marginBottom: "-5px" }}>Work / Reward</h5>
                            <div>
                                
                            </div>

                            <h5 style={{ marginBottom: "-5px" }}>Allocated Work Range</h5>
                            <div>
                                
                            </div>
                        </div>
                    </div>
                    <div style={{marginTop:'30px', display:'flex', justifyContent:'center'}}>
                        <button onClick={toggleMining} disabled={deviceInfo.device === "none"} 
                                onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
                            style={{
                                fontSize: "30px", border: '2px solid', borderRadius: "5px",
                                backgroundColor: hover?"#252525":"#FEFEFE", color: hover?"#EFEFEF":"#252525", fontWeight: "600", boxShadow: "2px 2px 2px #252525"
                                
                            }}>
                            Start Mining ⛏️
                        </button>
                    </div>
                </div>

                <div style={{width: "42%", backgroundColor: "#FEFEFE", padding: "0px 20px", display: 'flex', flexDirection: 'column' }}>
                    <h3>Block History</h3>
                    <BlockSwiper />
                    <hr />
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: "center" }}>
                <p style={{ fontFamily: "Times New Roman", fontSize:"25px", fontWeight:'500'}}>copyright <>&copy;</> 2024. Dweb All right resreved. </p>
            </div>
        </div>

    );
}

export default Frontend;