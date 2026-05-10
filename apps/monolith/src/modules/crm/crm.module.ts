import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactRequest } from './entities/contact-request.entity';
import { Appointment } from './entities/appointment.entity';
import { Offer } from './entities/offer.entity';
import { OfferResponse } from './entities/offer-response.entity';
import { NotificationQueue } from './entities/notification-queue.entity';
import { NotificationLog } from './entities/notification-log.entity';
import { UserActivityLog } from './entities/user-activity-log.entity';
import { Dealer } from './entities/dealer.entity';
import { ReferralCredit } from './entities/referral-credit.entity';
import { User } from '../auth/entities/user.entity';

import { ContactRequestService } from './services/contact-request.service';
import { AppointmentService } from './services/appointment.service';
import { OfferService } from './services/offer.service';
import { ActivityTrackingService } from './services/activity-tracking.service';
import { DealerService } from './services/dealer.service';
import { ReferralService } from './services/referral.service';

import { ContactRequestController } from './controllers/contact-request.controller';
import { AppointmentController } from './controllers/appointment.controller';
import { OfferController } from './controllers/offer.controller';
import { ActivityController } from './controllers/activity.controller';
import { DealerController } from './controllers/dealer.controller';
import {
  ReferralController,
  AdminReferralController,
} from './controllers/referral.controller';

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
      Dealer,
      ReferralCredit,
      User,
    ]),
  ],
  controllers: [
    ContactRequestController,
    AppointmentController,
    OfferController,
    ActivityController,
    DealerController,
    ReferralController,
    AdminReferralController,
  ],
  providers: [
    ContactRequestService,
    AppointmentService,
    OfferService,
    ActivityTrackingService,
    DealerService,
    ReferralService,
  ],
  exports: [TypeOrmModule, ContactRequestService, AppointmentService, OfferService, ActivityTrackingService, DealerService, ReferralService],
})
export class CrmModule {}
