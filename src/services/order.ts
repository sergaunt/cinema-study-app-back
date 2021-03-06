import { SeatItem } from '../types/session';
import sequelize from '../config/sequelize';
import Session from '../models/Session';
import OrderModel from '../models/Order';
import Bonus from '../models/Bonus';
import User from '../models/User';
import Movie from '../models/Movie';
import Hall from '../models/Hall';
import Cinema from '../models/Cinema';
import parseOrder from '../helpers/parseOrder';

interface QueryParamsType {
  'user-id': number;
}

export default {
  async getAll(queryParams?: QueryParamsType): Promise<any> {
    const result = await OrderModel.findAll({
      where: queryParams,
      include: [
        {
          model: Bonus,
          as: 'bonuses',
          attributes: ['id', 'title', 'price']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'username']
        },
        {
          model: Session,
          as: 'session',
          attributes: ['id', 'date'],
          include: [
            {
              model: Movie,
              as: 'movie'
            },
            {
              model: Hall,
              as: 'hall',
              include: [
                {
                  model: Cinema,
                  as: 'cinema'
                }
              ]
            }
          ]
        }
      ],
      order: [['id', 'ASC']]
    });
    return result.map(parseOrder);
  },

  async create(body: any, userID: number): Promise<boolean> {
    const parsedBody = {
      'user-id': userID,
      'session-id': body.sessionID,
      seats: body.seats
    };
    const transaction = await sequelize.transaction();
    try {
      const newOrder = await OrderModel.create(parsedBody, {
        transaction,
        returning: true
      });
      const queryPromises: any[] = [];
      body.bonuses.forEach((bonus: { id: number; quantity: number }) => {
        queryPromises.push(
          newOrder.addBonuses([bonus.id], {
            transaction,
            through: { quantity: bonus.quantity }
          })
        );
      });
      await Promise.all(queryPromises);
      const session = await Session.findByPk(body.sessionID);
      if (!session) throw new Error();
      await session.update({ ordered: body.seats }, { transaction });
      await transaction.commit();
    } catch (error) {
      if (error) await transaction.rollback();
      return false;
    }
    return true;
  },

  async reserve(
    userID: number,
    sessionID: number,
    body: SeatItem
  ): Promise<boolean> {
    const session = await Session.findByPk(sessionID);
    if (!session) return false;
    session.update({ reserved: { ...body, userID } });
    return true;
  },

  async cancelReservation(
    userID: number,
    sessionID: number,
    seatsToCancel: SeatItem[]
  ) {
    const session = await Session.findByPk(sessionID);
    if (!session) return false;
    const transaction = await sequelize.transaction();
    try {
      const queryPromises: any[] = [];
      seatsToCancel.forEach(seatToCancel => {
        queryPromises.push(
          session.update({ reserved: { ...seatToCancel, userID } })
        );
      });
      await Promise.all(queryPromises);
      await transaction.commit();
    } catch (error) {
      if (error) await transaction.rollback();
      return false;
    }
    return true;
  }
};
