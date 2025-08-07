const fs = require('fs').promises;
const { createServer } = require('http');
const { Server } = require('socket.io');

class Agent {
    constructor() {
        this.lastCpuCheck = Date.now();
        this.lastCpuUsage = 0;
    }
    
    async memoryLoad() {
        // Calculate memory load
        
        try {
            // see:
            // /sys/fs/cgroup/memory.current
            // /sys/fs/cgroup/memory.max
            const memCurrentStr = await fs.readFile('/sys/fs/cgroup/memory.current', 'utf8');
            const memMaxStr = await fs.readFile('/sys/fs/cgroup/memory.max', 'utf8');

            const memCurrent = parseInt(memCurrentStr.trim());
            const memMax = memMaxStr.trim() === 'max' ? memCurrent : parseInt(memMaxStr.trim());

            const usage = (memCurrent / memMax) * 100;
            return parseFloat(usage.toFixed(2));
        } catch (err) {
            console.error('Failed to read memory info:', err);
            return 0;
        }

    }

    async cpuLoad() {
        // Calculate cpu load
        
        try {
            // to calculate CPU load:
            // 1. read usage_usec value from /sys/fs/cgroup/cpu.stat this is cpu time in microseconds
            // 2. store usage_usec on each run of cpuLoad() and calculate how much is increased since last run (you can store it in this.lastCpuUsage)
            // 3. store and calculate time since last time cpuLoad() was called (you can store timestamps from Date.now() and calculate the time difference)
            // 4. calculate the cpu load percentage as (usage_usec changes since last run / time since last run in seconds) * 100
            const statStr = await fs.readFile('/sys/fs/cgroup/cpu.stat', 'utf8');
            const usageLine = statStr.split('\n').find(line => line.startsWith('usage_usec'));

            const currentUsage = parseInt(usageLine.split(' ')[1]); // microseconds
            const currentTime = Date.now(); // milliseconds

            const usageDelta = currentUsage - this.lastCpuUsage;
            const timeDelta = (currentTime - this.lastCpuCheck) / 1000; // convert ms to sec

            this.lastCpuUsage = currentUsage;
            this.lastCpuCheck = currentTime;

            const cpuPercent = (usageDelta / 1000) / timeDelta; // because usage_usec is in microseconds

            return parseFloat(cpuPercent.toFixed(2));
        } catch (err) {
            console.error('Failed to read CPU info:', err);
            return 0;
        }

    }
    
    // TODO: other metrics
}


const agent = new Agent();
const httpServer = createServer();
const io = new Server(httpServer, {
    transports: ['websocket']
});

io.on('connection', (socket) => {
    console.log('Agent connected to monitor')
    setInterval(async () => {
        const memoryLoad = await agent.memoryLoad();
        const cpuLoad = await agent.cpuLoad();
        console.log({ memoryLoad, cpuLoad });
        socket.emit('monitoring-stats', { memoryLoad, cpuLoad });
    }, 1000);
});

httpServer.listen(process.env.AGENT_PORT || 5001, () => {
    console.log('Agent listening on port ' + process.env.AGENT_PORT || 5001 + '!');
});
