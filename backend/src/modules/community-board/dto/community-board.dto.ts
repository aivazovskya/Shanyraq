import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  IsBoolean,
  IsInt,
  Max,
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

  // Только для type = AD
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  adBusinessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  adContactPhone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  adMonths?: number;
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

export class UpdatePhoneVisibilityDto {
  @IsBoolean()
  hidePhoneInListings: boolean;
}

export class SetAdPricingDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  adPriceMonthly?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  adPinPriceWeekly?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  adTrialDays?: number;
}

export class PinAdDto {
  @IsInt()
  @Min(1)
  @Max(12)
  weeks: number;
}
