import { Controller, Post, Get } from '@nestjs/common';

@Controller('api/v1/orders')
export class OrdersController {
  @Get()
  findAll() {}

  @Post()
  create() {}
}
