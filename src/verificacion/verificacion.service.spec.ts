import { Test, TestingModule } from '@nestjs/testing';
import { VerificacionService } from './verificacion.service';

describe('VerificacionService', () => {
  let service: VerificacionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VerificacionService],
    }).compile();

    service = module.get<VerificacionService>(VerificacionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
