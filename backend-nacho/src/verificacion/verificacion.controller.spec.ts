import { Test, TestingModule } from '@nestjs/testing';
import { VerificacionController } from './verificacion.controller';

describe('VerificacionController', () => {
  let controller: VerificacionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VerificacionController],
    }).compile();

    controller = module.get<VerificacionController>(VerificacionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
