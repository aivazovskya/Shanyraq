import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ListingType, ListingStatus } from '@prisma/client';

export class CreateListingDto {
  @IsEnum(ListingType)
  @IsNotEmpty()
  type: ListingType;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(150)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  description: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[];
}

export class UpdateListingDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(5)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[];

  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;
}

export class ModerateListingDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class GetListingsQueryDto {
  @IsOptional()
  @IsEnum(ListingType)
  type?: ListingType;

  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;
}
