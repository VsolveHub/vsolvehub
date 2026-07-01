-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "area" TEXT,
ADD COLUMN     "cityName" TEXT,
ADD COLUMN     "pincode" TEXT,
ADD COLUMN     "servicesOffered" TEXT NOT NULL DEFAULT '[]';
