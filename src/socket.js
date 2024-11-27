import io from 'socket.io-client';
import getServerTime from './sync_time';

const createSocketConnection = ({ address, url, metaData, onBigMessage, onLittleMessage, onStopWorking, resultMessage, isMiningEnabled }) => {
    const sync_time = async (socketRef, setTimeDifference) => {
        const serverUnixTime = await getServerTime(url);
        if (serverUnixTime == null) {
            alert("server stoppped");
            window.location.reload();

            return;
        }
        const localUnixTime = Math.floor(Date.now() / 1000);
        const timeDifference = serverUnixTime - localUnixTime;
        setTimeDifference(timeDifference);
        console.log(`Time Difference: ${timeDifference} seconds`);
    };

    const socketRef = { current: null };
    if (isMiningEnabled) {

        const socket = io(url, {
            query: { address }
        });
        socketRef.current = socket;
        socket.on('connection', () => {
            console.log('WebSocket connected');
        });
        socket.on('disconnect', () => {
            console.log('WebSocket disconnected');
        });
        socket.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
        socket.on("bigEpochStart", (message) => {
            console.log("Big Epoch Start");
            if (message) {
                onBigMessage(message);
            }
        });
        socket.on("littleEpochStart", (message) => {
            console.log("Little Epoch Start");
            if (message) {
                onLittleMessage(message);
            }
        });
        socket.on("stopWorking", (message) => {
            console.log("Someone mined the block", message);
            if (message) {
                onStopWorking(message);
            }
        });

        sync_time(socketRef, (timeDiff) => { socketRef.timeDifference = timeDiff; });

        const intervalId = setInterval(() => {
            // const now = new Date();
            // if ((now.getUTCSeconds() + (socketRef.timeDifference || 0)) % 60 === 0) {
                const message = { type: 'heartbeat', timestamp: Date.now(), metaData: metaData, address: address };
                socket.emit('heartbeat', message);
                // console.log('Heartbeat sent:', message);
            // }
        }, 1000);
        if (resultMessage !== "initial") {
            const message = JSON.stringify(resultMessage);
            socketRef.current.emit('clientResult', message);
            console.log('Result sent:', message);
        }

        return () => {
            clearInterval(intervalId);
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }
};

export default createSocketConnection;