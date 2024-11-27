import React, { useEffect, useState } from 'react';

const DataComponent = () => {
    const [data, setData] = useState([]);
    const URL = "https://webgpu-server-ffwmi.run.goorm.site";
    // const URL = "http://localhost:8000";
    const fetchData = () => {
        fetch('https://webgpu-server-ffwmi.run.goorm.io/history')
        // fetch('http://localhost:8000/history')
            .then(response => response.json())
            .then(data => setData(data))
            .catch(error => console.error('Error fetching data:', error));
    };

    useEffect(() => {
        // 처음 컴포넌트가 마운트될 때 데이터 가져오기
        fetchData();

        // 5초마다 데이터 업데이트
        const intervalId = setInterval(() => {
            fetchData();
        }, 5000); // 5000ms = 5초

        // 컴포넌트가 언마운트될 때 interval을 정리해 메모리 누수 방지
        return () => clearInterval(intervalId);
    }, []);

    return (
        <div style={{ height: '100vw', overflowY: 'scroll', padding: '5px', backgroundColor: '#FEFEFE', fontSize: '16px', width:'100%'}}>
            {data.map((item, index) => (
                <div key={index} style={{ marginBottom: '5px', padding: '5px', border: '1px solid #ccc', borderRadius: '8px', backgroundColor: '#fff', overflow:'hidden'}}>
                    <p style={{ marginBottom: '-10px' }}><strong>Block Number:</strong> {item.blockNumber}</p>
                    <p style={{ marginBottom: '-10px' }}><strong>Hash:</strong> {item.hash}</p>
                    <p style={{ marginBottom: '-10px' }}><strong>Distance:</strong> {item.distance}</p>
                    <p style={{ marginBottom: '-10px' }}><strong>Nonce:</strong> {item.nonce}</p>
                    <p style={{ marginBottom: '-10px' }}><strong>Target:</strong> {item.target}</p>
                    <p style={{ marginBottom: '-10px' }}><strong>Clients:</strong> {item.clients}</p>
                    <p style={{ marginBottom: '-10px' }}><strong>PrevHash:</strong> {item.prevhash}</p>
                    <p style={{ marginBottom: '-10px' }}><strong>Timestamp:</strong> {item.Timestamp}</p>
                    <p><strong>Miner ID:</strong> {item.miner_ID}</p>
                </div>
            ))}
        </div>
    );
}

export default DataComponent;