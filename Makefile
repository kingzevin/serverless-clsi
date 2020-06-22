all: update

update: 
	./rezip.sh clsi
	wsk -i action update /guest/sharelatex/clsi clsi.zip --kind  nodejs:10tex --web true
