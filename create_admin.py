from app.database import SessionLocal
from app import models
from app.core import security

def force_reset():
    db = SessionLocal()
    
    # Check if the account exists
    admin = db.query(models.User).filter(models.User.fnum == "A/2408").first()
    
    # We are forcing the password to be exactly 'admin123'
    new_password = "admin123"
    hashed = security.get_password_hash(new_password)
    
    if admin:
        admin.hashed_password = hashed
        admin.region = "KMP HEADQUARTERS"
        admin.station = "KMP HEADQUARTERS"
        admin.name = "Afedra Vincent"
        admin.rank = "AIP"
        admin.role = "SUPER_ADMIN" # <--- THIS IS THE CRITICAL LINE THAT WAS MISSING
        print("\n✅ SUCCESS: Existing A/2408 account overridden and SUPER_ADMIN restored.")
        print(f"🔑 Your new Security Key is: {new_password}\n")
    else:
        new_admin = models.User(
            fnum="A/2408",
            ipps="950010",
            name="Afedra Vincent",
            rank="AIP",
            region="KMP HEADQUARTERS",
            station="KMP HEADQUARTERS",
            role="SUPER_ADMIN",
            hashed_password=hashed
        )
        db.add(new_admin)
        print("\n✅ SUCCESS: Brand new Central Command account created.")
        print(f"🔑 Your Security Key is: {new_password}\n")
        
    db.commit()
    db.close()

if __name__ == "__main__":
    force_reset()