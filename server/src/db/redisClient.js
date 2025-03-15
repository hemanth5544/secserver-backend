import { createClient } from 'redis';

const client = createClient({
    username: 'default',
    password: '1rZWYmn6gcBvAjiQ57h43PRdzgwvI4LY',
    socket: {
        host: 'redis-15817.c264.ap-south-1-1.ec2.redns.redis-cloud.com',
        port: 15817
    }
});

client.on('error', err => console.log('Redis Client Error', err));

(async () => {
    await client.connect();
})();

export default client;

