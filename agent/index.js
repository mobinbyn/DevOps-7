const fs = require('fs');
const fsPromises = require('fs').promises;
const { createServer } = require('http');
const { Server } = require('socket.io');

class Agent {
    constructor() {
        this.lastCpuCheck = Date.now();
        this.lastCpuUsage = 0;
    }
    
    async memoryLoad() {
        // Calculate memory load
        // see:
        // /sys/fs/cgroup/memory.current
        // /sys/fs/cgroup/memory.max
        try {
            let usage, limit;

            // cgroup v1 paths
            if (fs.existsSync('/sys/fs/cgroup/memory/memory.usage_in_bytes')) {
                usage = parseInt(await fsPromises.readFile('/sys/fs/cgroup/memory/memory.usage_in_bytes', 'utf8'));
                limit = parseInt(await fsPromises.readFile('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8'));
            }
            // cgroup v2 paths
            else if (fs.existsSync('/sys/fs/cgroup/memory.current')) {
                usage = parseInt(await fsPromises.readFile('/sys/fs/cgroup/memory.current', 'utf8'));
                limit = parseInt((await fsPromises.readFile('/sys/fs/cgroup/memory.max', 'utf8')).trim());
                if (isNaN(limit)) {
                    // unlimited → use total system memory
                    limit = os.totalmem();
                }
            } else {
                return -1;
            }
            console.log(`Memory usage: ${usage} / ${limit}`);
            return parseFloat(((usage / limit) * 100).toFixed(2));
        } catch (err) {
            console.error('Failed to read memory info:', err);
            return -1;
        }

    }

    async cpuLoad() {
        // Calculate cpu load
        // to calculate CPU load:
        // 1. read usage_usec value from /sys/fs/cgroup/cpu.stat this is cpu time in microseconds
        // 2. store usage_usec on each run of cpuLoad() and calculate how much is increased since last run (you can store it in this.lastCpuUsage)
        // 3. store and calculate time since last time cpuLoad() was called (you can store timestamps from Date.now() and calculate the time difference)
        // 4. calculate the cpu load percentage as (usage_usec changes since last run / time since last run in seconds) * 100
        
        try {
            let currentUsage, usageInSeconds;

            if (fs.existsSync('/sys/fs/cgroup/cpu/cpuacct.usage')) {
                currentUsage = parseInt(await fsPromises.readFile('/sys/fs/cgroup/cpu/cpuacct.usage', 'utf8'));
                usageInSeconds = currentUsage / 1_000_000_000; // from nanoseconds to seconds
            } else if (fs.existsSync('/sys/fs/cgroup/cpu.stat')) {
                const statStr = await fsPromises.readFile('/sys/fs/cgroup/cpu.stat', 'utf8');
                const usageLine = statStr.split('\n').find(line => line.startsWith('usage_usec'));
                currentUsage = parseInt(usageLine.split(' ')[1]);
                usageInSeconds = currentUsage / 1_000_000; // from microseconds to seconds
            } else {
                return -1;
            }

            const currentTime = Date.now() / 1000; // seconds
            const usageDelta = usageInSeconds - (this.lastCpuUsage || 0);
            const timeDelta = currentTime - (this.lastCpuCheck || currentTime);

            this.lastCpuUsage = usageInSeconds;
            this.lastCpuCheck = currentTime;

            if (timeDelta === 0) return 0;

            // CPU load in percentage (normalized to one CPU)
            const cpuLoad = (usageDelta / timeDelta) * 100;
            return parseFloat(cpuLoad.toFixed(2));

        } catch (err) {
            console.error('Failed to read CPU info:', err);
            return -1;
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
