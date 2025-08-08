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
            let currentUsage;

            // cgroup v1: cpuacct
            const cpuacctUsagePath = '/sys/fs/cgroup/cpuacct/cpuacct.usage';
            if (fs.existsSync(cpuacctUsagePath)) {
                const usageStr = await fs.readFile(cpuacctUsagePath, 'utf8');
                currentUsage = parseInt(usageStr);
                if (isNaN(currentUsage)) {
                    throw new Error('cpuacct.usage is not a number');
                }
                currentUsage = currentUsage / 1000; // convert nanoseconds to microseconds
            } else {
                // اگر این فایل نبود، میشه از روش‌های دیگه استفاده کرد یا -1 برگردوند
                console.error('cpuacct.usage not found');
                return -1;
            }

            const currentTime = Date.now();
            const usageDelta = currentUsage - (this.lastCpuUsage || 0);
            const timeDelta = (currentTime - (this.lastCpuCheck || currentTime)) / 1000; // seconds

            this.lastCpuUsage = currentUsage;
            this.lastCpuCheck = currentTime;

            console.log(`CPU usage: ${usageDelta} microseconds over ${timeDelta} seconds`);
            if (timeDelta === 0) return 0;

            // usageDelta: میکروثانیه CPU مصرف شده، تقسیم بر ثانیه زمان میده درصد مصرف
            return parseFloat(((usageDelta / 10000) / timeDelta).toFixed(2)); // تبدیل به درصد CPU
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
