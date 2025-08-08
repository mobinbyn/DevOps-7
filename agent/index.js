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
        // see:
        // /sys/fs/cgroup/memory.current
        // /sys/fs/cgroup/memory.max
        
        try {
            const used = parseInt(fs.readFileSync('/sys/fs/cgroup/memory/memory.usage_in_bytes', 'utf8'));
            const limit = parseInt(fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8'));

            // اگر limit خیلی بزرگ بود (unlimited)، می‌تونیم بجای اون از کل حافظه سیستم استفاده کنیم
            if (limit > 1e15) { // یعنی unlimited
            const os = require('os');
            return Math.round((used / os.totalmem()) * 100);
            }

            return Math.round((used / limit) * 100);
        } catch (err) {
            console.error('Error reading memory usage:', err);
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
            // مسیر درست برای گرفتن مصرف CPU
            const usageStr = await fs.readFile('/sys/fs/cgroup/cpuacct/cpuacct.usage', 'utf8');
            const currentUsage = parseInt(usageStr.trim()); // نانوثانیه
            const currentTime = Date.now(); // میلی‌ثانیه

            // اگر بار اول هست که صدا زده میشه، فقط مقدار رو ذخیره کن
            if (this.lastCpuUsage === undefined) {
                this.lastCpuUsage = currentUsage;
                this.lastCpuCheck = currentTime;
                return 0; // چون داده قبلی نداریم
            }

            const usageDelta = currentUsage - this.lastCpuUsage; // نانوثانیه
            const timeDelta = (currentTime - this.lastCpuCheck) / 1000; // به ثانیه

            this.lastCpuUsage = currentUsage;
            this.lastCpuCheck = currentTime;

            // تعداد هسته‌های CPU
            const numCPUs = os.cpus().length;

            // درصد مصرف CPU
            const cpuPercent = (usageDelta / 1e9 / timeDelta / numCPUs) * 100;

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
