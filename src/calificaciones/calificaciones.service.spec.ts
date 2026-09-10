import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CalificacionesService } from './calificaciones.service';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';

describe('CalificacionesService', () => {
  let service: CalificacionesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalificacionesService,
        { provide: SUPABASE_CLIENT, useValue: {} },
      ],
    }).compile();

    service = module.get<CalificacionesService>(CalificacionesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('rechaza puntajes fuera de rango', async () => {
    await expect(
      service.crearCalificacion({
        trabajoId: 't1',
        calificadorId: 'c1',
        calificadoId: 'c2',
        puntaje: 6,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza calificar sin ids requeridos', async () => {
    await expect(
      service.crearCalificacion({
        trabajoId: '',
        calificadorId: 'c1',
        calificadoId: 'c2',
        puntaje: 5,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza listar sin empleadoId', async () => {
    await expect(service.listarPorEmpleado('')).rejects.toThrow(
      BadRequestException,
    );
  });
});
