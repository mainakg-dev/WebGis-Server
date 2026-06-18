import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { S3Service } from './s3.service.js';

@Controller('s3')
export class S3Controller {
  constructor(private s3Service: S3Service) {}

  @UseGuards(JwtAuthGuard)
  @Get('presigned-url')
  async getUploadPresignedUrl(
    @Request() req: any,
    @Query('filename') filename: string,
    @Query('filetype') filetype: string,
    @Query('folder') folder?: string,
  ) {
    if (!filename || !filetype) {
      throw new BadRequestException(
        'filename and filetype query parameters are required',
      );
    }
    const userId = req.user.sub;
    return this.s3Service.getUploadPresignedUrl(
      userId,
      filename,
      filetype,
      folder,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('report-presigned-url')
  async getReportUploadPresignedUrl(
    @Request() req: any,
    @Query('filename') filename: string,
    @Query('filetype') filetype: string,
    @Query('towerId') towerId: string,
    @Query('type') type: string,
  ) {
    if (!filename || !filetype || !towerId || !type) {
      throw new BadRequestException(
        'filename, filetype, towerId, and type query parameters are required',
      );
    }
    if (type !== 'thermal' && type !== 'findings') {
      throw new BadRequestException('type must be either thermal or findings');
    }
    const userId = req.user.sub;
    return this.s3Service.getReportUploadPresignedUrl(
      userId,
      filename,
      filetype,
      towerId,
      type,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('reports/:towerId')
  async getReportsForTower(@Param('towerId') towerId: string) {
    return this.s3Service.getReportsForTower(towerId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('images')
  async fetchAllImagesFromS3() {
    return this.s3Service.fetchAllImagesFromS3();
  }

  @UseGuards(JwtAuthGuard)
  @Get('db-images')
  async getImagesFromDatabase() {
    return this.s3Service.getImagesFromDatabase();
  }
}
