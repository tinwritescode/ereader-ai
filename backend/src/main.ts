import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // A long chapter's sentences go past Express's default 100 kB.
  app.useBodyParser('json', { limit: '2mb' });
  // A chapter's JSON shrinks to about a third; audio and pictures are left as they are.
  app.use(compression());
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
