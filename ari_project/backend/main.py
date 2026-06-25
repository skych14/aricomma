from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
import models, database
import datetime

# DB 테이블 자동 생성
database.Base.metadata.create_all(bind=database.engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class LoginRequest(BaseModel):
    student_id: str
    password: str

class SeatRequest(BaseModel):
    student_id: str

@app.post("/api/login")
def login(request: LoginRequest):
    return {"success": True, "user_info": {"student_id": request.student_id}}

@app.get("/api/seats")
def get_seats(db: Session = Depends(database.get_db)):
    seats = db.query(models.Seat).all()
    if not seats:
        init_seats = [models.Seat(id=f"A-0{i}") for i in range(1, 7)]
        db.add_all(init_seats)
        db.commit()
        seats = db.query(models.Seat).all()
    return seats

# [기존] 1. 좌석 예약 API
@app.post("/api/seats/{seat_id}/reserve")
def reserve_seat(seat_id: str, request: SeatRequest, db: Session = Depends(database.get_db)):
    seat = db.query(models.Seat).filter(models.Seat.id == seat_id).first()
    if not seat or seat.status != "AVAILABLE":
        raise HTTPException(status_code=400, detail="예약할 수 없는 좌석입니다.")
    
    seat.status = "RESERVED"
    new_log = models.UsageLog(student_id=request.student_id, seat_id=seat_id)
    db.add(new_log)
    db.commit()
    return {"message": f"{seat_id} 예약 완료! 10분 내로 현장에서 QR을 스캔하세요."}

# [신규] 2. QR 체크인 API (이용 시작)
@app.post("/api/seats/{seat_id}/check-in")
def checkin_seat(seat_id: str, request: SeatRequest, db: Session = Depends(database.get_db)):
    seat = db.query(models.Seat).filter(models.Seat.id == seat_id).first()
    if not seat or seat.status != "RESERVED":
        raise HTTPException(status_code=400, detail="예약된 좌석만 QR 체크인이 가능합니다.")
    
    seat.status = "USING" # 상태를 '이용중'으로 변경
    
    # 해당 사용자의 가장 최근 예약 로그를 찾아 체크인 시간 기록
    log = db.query(models.UsageLog).filter(
        models.UsageLog.seat_id == seat_id,
        models.UsageLog.student_id == request.student_id,
        models.UsageLog.checkin_at == None
    ).order_by(models.UsageLog.id.desc()).first()
    
    if log:
        log.checkin_at = datetime.datetime.utcnow()
        
    db.commit()
    return {"message": "QR 체크인 성공! 기본 이용 시간은 1시간입니다."}

# [신규] 3. 직접 퇴실 API
@app.post("/api/seats/{seat_id}/check-out")
def checkout_seat(seat_id: str, request: SeatRequest, db: Session = Depends(database.get_db)):
    seat = db.query(models.Seat).filter(models.Seat.id == seat_id).first()
    if not seat or seat.status != "USING":
        raise HTTPException(status_code=400, detail="이용 중인 좌석만 퇴실할 수 있습니다.")
    
    seat.status = "AVAILABLE" # 상태를 다시 '빈자리'로 되돌림
    
    # 퇴실 시간 기록
    log = db.query(models.UsageLog).filter(
        models.UsageLog.seat_id == seat_id,
        models.UsageLog.student_id == request.student_id,
        models.UsageLog.checkout_at == None
    ).order_by(models.UsageLog.id.desc()).first()
    
    if log:
        log.checkout_at = datetime.datetime.utcnow()
        
    db.commit()
    return {"message": "정상적으로 퇴실 처리되었습니다. 이용해 주셔서 감사합니다."}