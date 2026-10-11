import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // trust proxy left disabled: do not honor X-Forwarded-For by default.
  const app = await NestFactory.create(AppModule);
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  console.log(`ThrottleForge listening on http://localhost:${port}`);
}

bootstrap();
