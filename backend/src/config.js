import 'dotenv/config';

const env = process.env;
const nodeEnv = env.NODE_ENV || 'development';

export const config = {
  env: nodeEnv,
  isProd: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: Number(env.PORT || 4000),
  databaseUrl: nodeEnv === 'test' ? env.TEST_DATABASE_URL : env.DATABASE_URL,
  dbSsl: env.DATABASE_SSL === 'true',
  jwtSecret: env.JWT_SECRET || (nodeEnv === 'production' ? '' : 'dev-only-insecure-secret'),
  jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',
  bcryptRounds: Number(env.BCRYPT_ROUNDS || 10),
  corsOrigins: (env.CORS_ORIGINS || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
};

if (config.isProd && !config.jwtSecret) throw new Error('JWT_SECRET must be set in production');
if (!config.databaseUrl) throw new Error(config.isTest ? 'TEST_DATABASE_URL is not set' : 'DATABASE_URL is not set');
