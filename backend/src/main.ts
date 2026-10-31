import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // A long chapter's sentences go past Express's default 100 kB.
  app.useBodyParser('json', { limit: '2mb' });
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
