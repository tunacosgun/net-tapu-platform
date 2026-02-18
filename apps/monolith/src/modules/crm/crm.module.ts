import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactRequest } from './entities/contact-request.entity';
import { Appointment } from './entities/appointment.entity';
import { Offer } from './entities/offer.entity';
import { OfferResponse } from './entities/offer-response.entity';
import { NotificationQueue } from './entities/notification-queue.entity';
import { NotificationLog } from './entities/notification-log.entity';
import { UserActivityLog } from './entities/user-activity-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ContactRequest,
      Appointment,
      Offer,
      OfferResponse,
      NotificationQueue,
      NotificationLog,
      UserActivityLog,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class CrmModule {}
