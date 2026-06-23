import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class S3Service {
  private s3Client: S3Client;
  private readonly logger = new Logger(S3Service.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const region = this.configService.getOrThrow<string>('AWS_REGION');
    const accessKeyId =
      this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.getOrThrow<string>(
      'AWS_SECRET_ACCESS_KEY',
    );

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async getUploadPresignedUrl(
    userId: number,
    filename: string,
    filetype: string,
    folder?: string,
  ) {
    const bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET');
    const uniqueId = Math.random().toString(36).substring(2, 8);
    const folderPath = folder ? `${folder}/` : '';
    const key = `uploads/${userId}/${folderPath}${uniqueId}-${filename}`;
    const thumbKey = `uploads/${userId}/${folderPath}thumbnails/${uniqueId}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: filetype,
    });

    const thumbCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: thumbKey,
      ContentType: 'image/jpeg',
    });

    // Generate PUT presigned URL valid for 15 mins (900s)
    const presignedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 900,
    });

    const thumbPresignedUrl = await getSignedUrl(this.s3Client, thumbCommand, {
      expiresIn: 900,
    });

    const region = this.configService.getOrThrow<string>('AWS_REGION');
    const imageUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    const thumbUrl = `https://${bucket}.s3.${region}.amazonaws.com/${thumbKey}`;

    // Save image metadata in the database
    const dbImage = await this.prisma.image.create({
      data: {
        key,
        url: imageUrl,
        thumbnailUrl: thumbUrl,
        userId,
      },
    });

    return {
      presignedUrl,
      thumbPresignedUrl,
      imageUrl,
      thumbnailUrl: thumbUrl,
      image: dbImage,
    };
  }

  async fetchAllImagesFromS3() {
    const bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET');

    try {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: 'uploads/',
      });

      const response = await this.s3Client.send(command);
      const contents = response.Contents || [];

      // Generate GET presigned URLs so private images can be loaded securely
      const images = await Promise.all(
        contents.map(async (item) => {
          const getCommand = new GetObjectCommand({
            Bucket: bucket,
            Key: item.Key!,
          });
          const signedUrl = await getSignedUrl(this.s3Client, getCommand, {
            expiresIn: 3600,
          });
          return {
            key: item.Key,
            size: item.Size,
            lastModified: item.LastModified,
            url: signedUrl,
          };
        }),
      );

      return images;
    } catch (error: any) {
      this.logger.error(`Error listing S3 objects: ${error.message}`);
      throw new Error(`Failed to list images from S3: ${error.message}`);
    }
  }

  async getImagesFromDatabase() {
    return this.prisma.image.findMany({
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getReportUploadPresignedUrl(
    userId: number,
    filename: string,
    filetype: string,
    towerId: string,
    type: string,
  ) {
    const bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET');
    const uniqueId = Math.random().toString(36).substring(2, 8);
    const key = `uploads/${userId}/reports/${towerId}/${type}/${uniqueId}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: filetype,
    });

    const presignedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 900,
    });

    const region = this.configService.getOrThrow<string>('AWS_REGION');
    const reportUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

    const dbReport = await this.prisma.report.create({
      data: {
        key,
        url: reportUrl,
        towerId,
        type,
        userId,
      },
    });

    return {
      presignedUrl,
      imageUrl: reportUrl,
      report: dbReport,
    };
  }

  async getReportsForTower(towerId: string) {
    const reports = await this.prisma.report.findMany({
      where: { towerId },
      orderBy: { createdAt: 'desc' },
    });

    const bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET');
    return Promise.all(
      reports.map(async (report) => {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: bucket,
            Key: report.key,
          });
          const signedUrl = await getSignedUrl(this.s3Client, getCommand, {
            expiresIn: 3600,
          });
          return {
            ...report,
            url: signedUrl,
          };
        } catch (err: any) {
          this.logger.error(`Error signing URL for report ${report.id}: ${err.message}`);
          return report;
        }
      }),
    );
  }

  async getVideoUploadPresignedUrl(
    userId: number,
    filename: string,
    filetype: string,
    towerFromId: string,
    towerToId: string,
    type: string,
  ) {
    const bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET');
    const uniqueId = Math.random().toString(36).substring(2, 8);
    const key = `uploads/${userId}/videos/${towerFromId}-${towerToId}/${type}/${uniqueId}-${filename}`;
    const thumbKey = `uploads/${userId}/videos/${towerFromId}-${towerToId}/${type}/thumb-${uniqueId}.jpg`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: filetype,
    });

    const thumbCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: thumbKey,
      ContentType: 'image/jpeg',
    });

    const presignedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 900,
    });

    const thumbPresignedUrl = await getSignedUrl(this.s3Client, thumbCommand, {
      expiresIn: 900,
    });

    const region = this.configService.getOrThrow<string>('AWS_REGION');
    const videoUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    const thumbUrl = `https://${bucket}.s3.${region}.amazonaws.com/${thumbKey}`;

    // Delete old video record for this span+type if it exists (one video per span per type)
    await this.prisma.video.deleteMany({
      where: {
        towerFromId,
        towerToId,
        type,
      },
    });

    const dbVideo = await this.prisma.video.create({
      data: {
        key,
        url: videoUrl,
        thumbnailKey: thumbKey,
        thumbnailUrl: thumbUrl,
        towerFromId,
        towerToId,
        type,
        filename,
        userId,
      },
    });

    return {
      presignedUrl,
      thumbPresignedUrl,
      videoUrl,
      thumbnailUrl: thumbUrl,
      video: dbVideo,
    };
  }

  async getVideosForSpan(towerFromId: string, towerToId: string, type: string) {
    const video = await this.prisma.video.findUnique({
      where: {
        towerFromId_towerToId_type: {
          towerFromId,
          towerToId,
          type,
        },
      },
    });

    if (!video) {
      return null;
    }

    const bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET');

    try {
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: video.key,
      });
      const signedUrl = await getSignedUrl(this.s3Client, getCommand, {
        expiresIn: 3600,
      });

      let signedThumbUrl = video.thumbnailUrl;
      if (video.thumbnailKey) {
        const thumbGetCommand = new GetObjectCommand({
          Bucket: bucket,
          Key: video.thumbnailKey,
        });
        signedThumbUrl = await getSignedUrl(this.s3Client, thumbGetCommand, {
          expiresIn: 3600,
        });
      }

      return {
        ...video,
        url: signedUrl,
        thumbnailUrl: signedThumbUrl,
      };
    } catch (err: any) {
      this.logger.error(
        `Error signing URL for video ${video.id}: ${err.message}`,
      );
      return video;
    }
  }

  async getTowerVideoUploadPresignedUrl(
    userId: number,
    filename: string,
    filetype: string,
    towerId: string,
    type: string,
  ) {
    const bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET');
    const uniqueId = Math.random().toString(36).substring(2, 8);
    const key = `uploads/${userId}/tower-videos/${towerId}/${type}/${uniqueId}-${filename}`;
    const thumbKey = `uploads/${userId}/tower-videos/${towerId}/${type}/thumb-${uniqueId}.jpg`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: filetype,
    });

    const thumbCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: thumbKey,
      ContentType: 'image/jpeg',
    });

    const presignedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 900,
    });

    const thumbPresignedUrl = await getSignedUrl(this.s3Client, thumbCommand, {
      expiresIn: 900,
    });

    const region = this.configService.getOrThrow<string>('AWS_REGION');
    const videoUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    const thumbUrl = `https://${bucket}.s3.${region}.amazonaws.com/${thumbKey}`;

    // Delete old tower video for this tower+type if it exists
    await this.prisma.towerVideo.deleteMany({
      where: {
        towerId,
        type,
      },
    });

    const dbVideo = await this.prisma.towerVideo.create({
      data: {
        key,
        url: videoUrl,
        thumbnailKey: thumbKey,
        thumbnailUrl: thumbUrl,
        towerId,
        type,
        filename,
        userId,
      },
    });

    return {
      presignedUrl,
      thumbPresignedUrl,
      videoUrl,
      thumbnailUrl: thumbUrl,
      video: dbVideo,
    };
  }

  async getTowerVideo(towerId: string, type: string) {
    const video = await this.prisma.towerVideo.findUnique({
      where: {
        towerId_type: {
          towerId,
          type,
        },
      },
    });

    if (!video) {
      return null;
    }

    const bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET');

    try {
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: video.key,
      });
      const signedUrl = await getSignedUrl(this.s3Client, getCommand, {
        expiresIn: 3600,
      });

      let signedThumbUrl = video.thumbnailUrl;
      if (video.thumbnailKey) {
        const thumbGetCommand = new GetObjectCommand({
          Bucket: bucket,
          Key: video.thumbnailKey,
        });
        signedThumbUrl = await getSignedUrl(this.s3Client, thumbGetCommand, {
          expiresIn: 3600,
        });
      }

      return {
        ...video,
        url: signedUrl,
        thumbnailUrl: signedThumbUrl,
      };
    } catch (err: any) {
      this.logger.error(
        `Error signing URL for tower video ${video.id}: ${err.message}`,
      );
      return video;
    }
  }
}
