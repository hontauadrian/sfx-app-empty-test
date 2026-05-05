import Fastify from 'fastify';

const fastify = Fastify();

fastify.post('/auth/register', {
  schema: {
    body: { type: 'object', required: ['email'], properties: { email: { type: 'string' } } },
  },
}, async () => ({ ok: true }));

fastify.get('/health', async () => ({ ok: true }));

export default fastify;
