import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EvidenciaService } from './evidencia.service';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';
import { StorageService } from '../verificacion/storage.service';

describe('EvidenciaService', () => {
  let service: EvidenciaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenciaService,
        { provide: SUPABASE_CLIENT, useValue: {} },
        { provide: StorageService, useValue: {} },
      ],
    }).compile();

    service = module.get<EvidenciaService>(EvidenciaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('rechaza subir evidencia sin trabajoId', async () => {
    await expect(
      service.subirEvidencia('', 'user-1', Buffer.from('foto')),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza listar evidencia sin trabajoId', async () => {
    await expect(service.listarEvidencia('')).rejects.toThrow(
      BadRequestException,
    );
  });
});
