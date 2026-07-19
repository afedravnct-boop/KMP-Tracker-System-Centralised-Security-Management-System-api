from app.database import SessionLocal
from app import models
from app.core import security

def force_reset():
    db = SessionLocal()
    
    admin = db.query(models.Users).filter(models.Users.fnum == "A/2408").first()
    
    # We are forcing the password to be exactly 'admin123'
    new_password = "admin123"
    hashed = security.get_password_hash(new_password)
    
    if admin:
        admin.hashed_password = hashed
        admin.region = "KMP HEADQUARTERS"
        admin.division = "KMP HEADQUARTERS"
        admin.station = "KMP HEADQUARTERS"
        admin.name = "Afedra Vincent"
        admin.rank = "AIP"
        admin.role = "SUPER_ADMIN"
        admin.is_approved = True 
        print("\n✅ SUCCESS: Existing A/2408 account overridden and SUPER_ADMIN restored.")
        print(f"🔑 Your new Security Key is: {new_password}\n")
    else:
        new_admin = models.Users(
            fnum="A/2408",
            rank="AIP",
            name="Afedra Vincent",
            sex="MALE",
            ipps="950010",    
            region="KMP HEADQUARTERS",
            division="KMP HEADQUARTERS",
            station="KMP HEADQUARTERS",
            position="System Manager",
            email="afedravnct@gmail.com",
            phone="0779302872",
            hashed_password=hashed,
            role="SUPER_ADMIN",
            is_approved=True,
            profile_photo_path=""
        )
        db.add(new_admin)
        print("\n✅ SUCCESS: Brand new Central Command account created.")
        print(f"🔑 Your Security Key is: {new_password}\n")
        
    db.commit()
    db.close()

if __name__ == "__main__":
    force_reset()