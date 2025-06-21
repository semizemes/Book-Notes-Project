-- create table --
create table books (id serial, text TEXT, name VARCHAR(80),  ISBN integer, time VARCHAR(30), my_rate integer, images bytea, primary key(id, ISBN));

-- see all data --
select * from books

-- insert value -- //there is no time data, cause current time will be added when with req.body from the page
    insert into books (name, isbn, time, my_rate, image)
    values ()